import {
  ChunkType, ColorType, FilterMethod,
  encodeChunk, encodeHeader, encode_IHDR, encode_IDAT_raw
} from 'png-tools';
import { Deflate } from 'pako';

// Encode one tall PNG without ever allocating a canvas for the whole article.
export function createWriter(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 0x7fffffff || height > 0x7fffffff) {
    throw new Error('分享图片尺寸无效');
  }

  const parts = [encodeHeader(), encodeChunk({
    type: ChunkType.IHDR,
    data: encode_IHDR({ width, height, depth: 8, colorType: ColorType.RGBA })
  })];
  const deflator = new Deflate({ level: 3 });
  let rowsWritten = 0;
  deflator.onData = chunk => {
    parts.push(encodeChunk({ type: ChunkType.IDAT, data: chunk }));
  };

  function append(canvas) {
    if (rowsWritten >= height || canvas.width !== width ||
        canvas.height < 1 || rowsWritten + canvas.height > height) {
      throw new Error('分享图片分段尺寸不匹配');
    }
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('无法读取分享图片像素');
    const pixels = context.getImageData(0, 0, width, canvas.height).data;
    const scanlines = encode_IDAT_raw(pixels, {
      width, height: canvas.height, depth: 8, colorType: ColorType.RGBA,
      filter: FilterMethod.Paeth, firstFilter: FilterMethod.Sub
    });
    const last = rowsWritten + canvas.height === height;
    deflator.push(scanlines, last);
    if (deflator.err) throw new Error(deflator.msg || 'PNG 压缩失败');
    rowsWritten += canvas.height;
  }

  function finish() {
    if (rowsWritten !== height || !deflator.ended || deflator.err) {
      throw new Error('分享图片尚未完整生成');
    }
    parts.push(encodeChunk({ type: ChunkType.IEND }));
    return new Blob(parts, { type: 'image/png' });
  }

  return { append, finish };
}
