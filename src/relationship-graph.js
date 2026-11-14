import cytoscape from 'cytoscape';

export function buildRelationshipData(roster, articles) {
  const people = new Map(roster.map(person => [person.cardId, person]));
  const pairs = new Map();
  let unmatched = 0;
  for (const article of articles) {
    if (article.source !== 'easter') continue;
    const ids = [...new Set((Array.isArray(article.pair_card_ids) ? article.pair_card_ids : []).map(Number))].sort((a, b) => a - b);
    if (ids.length !== 2 || !ids.every(id => people.has(id))) { unmatched++; continue; }
    const key = ids.join('-');
    if (!pairs.has(key)) pairs.set(key, { id: key, source: ids[0], target: ids[1], articles: [] });
    pairs.get(key).articles.push({ id: article.id, title: article.title || '未命名奇遇', published: article.published !== false });
  }
  const edges = [...pairs.values()].map(pair => ({ ...pair, draftOnly: pair.articles.every(article => !article.published) ? 1 : 0 }));
  return {
    nodes: [...people.values()].map(person => ({ id: person.cardId, name: person.name, avatar: person.avatar })),
    edges,
    articleCount: edges.reduce((total, pair) => total + pair.articles.length, 0),
    unmatched
  };
}

function positionsFor(data) {
  const neighbors = new Map(data.nodes.map(node => [node.id, new Set()]));
  for (const edge of data.edges) {
    neighbors.get(edge.source).add(edge.target);
    neighbors.get(edge.target).add(edge.source);
  }
  const visited = new Set();
  const groups = [];
  for (const node of data.nodes) {
    if (!neighbors.get(node.id).size || visited.has(node.id)) continue;
    const group = [], pending = [node.id];
    visited.add(node.id);
    while (pending.length) {
      const id = pending.pop();
      group.push(id);
      for (const next of neighbors.get(id)) {
        if (!visited.has(next)) { visited.add(next); pending.push(next); }
      }
    }
    groups.push(group.sort((a, b) => a - b));
  }
  groups.sort((a, b) => b.length - a.length || a[0] - b[0]);

  const positions = new Map();
  let x = 0, y = 0, rowHeight = 0, right = 0, bottom = 0;
  for (const group of groups) {
    const radius = group.length === 2 ? 44 : Math.max(65, group.length * 15);
    const diameter = radius * 2 + 75;
    if (x && x + diameter > 950) { x = 0; y += rowHeight; rowHeight = 0; }
    const cx = x + diameter / 2, cy = y + diameter / 2;
    group.forEach((id, index) => {
      const angle = 2 * Math.PI * index / group.length - Math.PI / 2;
      positions.set(id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });
    x += diameter;
    rowHeight = Math.max(rowHeight, diameter);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y + diameter);
  }
  const origin = { x: right / 2, y: bottom / 2 };
  for (const [id, point] of positions) positions.set(id, { x: point.x - origin.x, y: point.y - origin.y });

  const isolated = data.nodes.filter(node => !neighbors.get(node.id).size).sort((a, b) => a.id - b.id);
  let radius = Math.max(240, Math.hypot(right, bottom) / 2 + 130);
  for (let offset = 0; offset < isolated.length; radius += 82) {
    const count = Math.min(isolated.length - offset, Math.floor(2 * Math.PI * radius / 80));
    for (let i = 0; i < count; i++) {
      const angle = 2 * Math.PI * i / count - Math.PI / 2;
      positions.set(isolated[offset + i].id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    }
    offset += count;
  }
  return positions;
}

export function createRelationshipView(container, data, { onSelect, onHover }) {
  const positions = positionsFor(data);
  const cy = cytoscape({
    container,
    elements: [
      ...data.nodes.map(node => ({ data: { ...node, id: String(node.id), avatar: '/' + node.avatar.replace(/^\//, '') }, position: positions.get(node.id) })),
      ...data.edges.map(edge => ({ data: { ...edge, id: `pair-${edge.id}`, source: String(edge.source), target: String(edge.target) } }))
    ],
    layout: { name: 'preset' },
    minZoom: 0.15,
    maxZoom: 3,
    wheelSensitivity: 0.18,
    style: [
      { selector: 'node', style: { width: 58, height: 58, shape: 'ellipse', 'background-color': '#dce9e2', 'background-image': 'data(avatar)', 'background-fit': 'cover', 'background-clip': 'node', 'border-width': 3, 'border-color': '#6f9d91', label: '' } },
      { selector: 'edge', style: { width: 3, 'line-color': '#7aa99a', 'curve-style': 'bezier' } },
      { selector: 'edge[draftOnly = 1]', style: { 'line-style': 'dashed' } },
      { selector: '.muted', style: { opacity: 0.18 } },
      { selector: 'node.active', style: { 'border-width': 5, 'border-color': '#b5794e', opacity: 1 } },
      { selector: 'edge.active', style: { width: 5, 'line-color': '#b5794e', opacity: 1 } }
    ]
  });

  const clear = () => { cy.elements().removeClass('muted active'); onSelect(null); };
  const select = element => {
    cy.elements().addClass('muted').removeClass('active');
    const connected = element.isNode() ? element.closedNeighborhood() : element.connectedNodes().union(element);
    connected.removeClass('muted').addClass('active');
    onSelect(element.data());
  };
  cy.on('tap', 'node, edge', event => select(event.target));
  cy.on('tap', event => { if (event.target === cy) clear(); });
  cy.on('mouseover', 'node, edge', event => onHover(event.target.data(), event.originalEvent));
  cy.on('mousemove', 'node, edge', event => onHover(event.target.data(), event.originalEvent));
  cy.on('mouseout', 'node, edge', () => onHover(null));
  cy.fit(cy.elements(), 45);
  return {
    selectPerson(id) {
      const node = cy.getElementById(String(id));
      if (!node.empty()) { select(node); cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1.2) }, { duration: 250 }); }
    },
    snapshot() { return { zoom: cy.zoom(), pan: { ...cy.pan() }, positions: cy.nodes().map(node => ({ id: node.id(), position: { ...node.position() } })) }; },
    restore(saved, selectedId) {
      cy.resize();
      if (saved) {
        for (const node of saved.positions) cy.getElementById(node.id).position(node.position);
        cy.zoom(saved.zoom); cy.pan(saved.pan);
      }
      if (selectedId && !cy.getElementById(selectedId).empty()) select(cy.getElementById(selectedId));
    },
    clear,
    fit() { cy.fit(cy.elements(), 45); },
    reset() { clear(); cy.fit(cy.elements(), 45); },
    destroy() { cy.destroy(); }
  };
}
