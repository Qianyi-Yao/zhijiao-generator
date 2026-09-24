/* =========================
   01. 人物资料（由 card_data.xlsx 整理）
   ========================= */
const characters = [
  {
    id: "yingzheng",
    cardId: 2001,
    name: "嬴政",
    dynasty: "秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/yingzheng_a.png",
    portrait: "portraits/yingzheng_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/yingzheng_b.png",
        portrait: "portraits/yingzheng_b.png"
      },
      {
        id: "c",
        avatar: "avatars/yingzheng_c.png",
        portrait: "portraits/yingzheng_c.png"
      },
      {
        id: "d",
        avatar: "avatars/yingzheng_d.png",
        portrait: "portraits/yingzheng_d.png"
      },
      {
        id: "e",
        avatar: "avatars/yingzheng_e.png",
        portrait: "portraits/yingzheng_e.png"
      }
    ]
  },

  {
    id: "jingke",
    cardId: 2002,
    name: "荆轲",
    dynasty: "先秦",
    rarity: "地",
    role: "输出",
    avatar: "avatars/jingke_a.png",
    portrait: "portraits/jingke_a.png"
  },

  {
    id: "gaojianli",
    cardId: 2003,
    name: "高渐离",
    dynasty: "先秦",
    rarity: "地",
    role: "防御",
    avatar: "avatars/gaojianli_a.png",
    portrait: "portraits/gaojianli_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/gaojianli_b.png",
        portrait: "portraits/gaojianli_b.png"
      }
    ]
  },

  {
    id: "weiqing",
    cardId: 2004,
    name: "卫青",
    dynasty: "汉",
    rarity: "天",
    role: "防御",
    avatar: "avatars/weiqing_a.png",
    portrait: "portraits/weiqing_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/weiqing_b.png",
        portrait: "portraits/weiqing_b.png"
      }
    ]
  },

  {
    id: "shangguanwaner",
    cardId: 2006,
    name: "上官婉儿",
    dynasty: "唐",
    rarity: "地",
    role: "治疗",
    avatar: "avatars/shangguanwaner_a.png",
    portrait: "portraits/shangguanwaner_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/shangguanwaner_b.png",
        portrait: "portraits/shangguanwaner_b.png"
      },
      {
        id: "c",
        avatar: "avatars/shangguanwaner_c.png",
        portrait: "portraits/shangguanwaner_c.png"
      }
    ]
  },

  {
    id: "sushi",
    cardId: 2007,
    name: "苏轼",
    dynasty: "宋",
    rarity: "地",
    role: "控制",
    avatar: "avatars/sushi_a.png",
    portrait: "portraits/sushi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/sushi_b.png",
        portrait: "portraits/sushi_b.png"
      },
      {
        id: "c",
        avatar: "avatars/sushi_c.png",
        portrait: "portraits/sushi_c.png"
      }
    ]
  },

  {
    id: "foyin",
    cardId: 2008,
    name: "佛印",
    dynasty: "宋",
    rarity: "玄",
    role: "治疗",
    avatar: "avatars/foyin_a.png",
    portrait: "portraits/foyin_a.png"
  },

  {
    id: "lixiuning",
    cardId: 2009,
    name: "李秀宁",
    dynasty: "唐",
    rarity: "玄",
    role: "输出",
    avatar: "avatars/lixiuning_a.png",
    portrait: "portraits/lixiuning_a.png"
  },

  {
    id: "zhangliang",
    cardId: 2010,
    name: "张良",
    dynasty: "汉",
    rarity: "天",
    role: "控制",
    avatar: "avatars/zhangliang_a.png",
    portrait: "portraits/zhangliang_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhangliang_b.png",
        portrait: "portraits/zhangliang_b.png"
      }
    ]
  },

  {
    id: "ruanji",
    cardId: 2011,
    name: "阮籍",
    dynasty: "三国",
    rarity: "地",
    role: "输出",
    avatar: "avatars/ruanji_a.png",
    portrait: "portraits/ruanji_a.png"
  },

  {
    id: "jikang",
    cardId: 2012,
    name: "嵇康",
    dynasty: "三国",
    rarity: "地",
    role: "控制",
    avatar: "avatars/jikang_a.png",
    portrait: "portraits/jikang_a.png"
  },

  {
    id: "wangzhaojun",
    cardId: 2013,
    name: "王昭君",
    dynasty: "汉",
    rarity: "天",
    role: "控制",
    avatar: "avatars/wangzhaojun_a.png",
    portrait: "portraits/wangzhaojun_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/wangzhaojun_b.png",
        portrait: "portraits/wangzhaojun_b.png"
      }
    ]
  },

  {
    id: "xiexuan",
    cardId: 2014,
    name: "谢玄",
    dynasty: "晋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/xiexuan_a.png",
    portrait: "portraits/xiexuan_a.png"
  },

  {
    id: "wuzetian",
    cardId: 2016,
    name: "武则天",
    dynasty: "唐",
    rarity: "天",
    role: "输出",
    avatar: "avatars/wuzetian_a.png",
    portrait: "portraits/wuzetian_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/wuzetian_b.png",
        portrait: "portraits/wuzetian_b.png"
      }
    ]
  },

  {
    id: "taipinggongzhu",
    cardId: 2017,
    name: "太平公主",
    dynasty: "唐",
    rarity: "地",
    role: "控制",
    avatar: "avatars/taipinggongzhu_a.png",
    portrait: "portraits/taipinggongzhu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/taipinggongzhu_b.png",
        portrait: "portraits/taipinggongzhu_b.png"
      }
    ]
  },

  {
    id: "lilongji",
    cardId: 2018,
    name: "李隆基",
    dynasty: "唐",
    rarity: "地",
    role: "防御",
    avatar: "avatars/lilongji_a.png",
    portrait: "portraits/lilongji_a.png"
  },

  {
    id: "yangyuhuan",
    cardId: 2019,
    name: "杨玉环",
    dynasty: "唐",
    rarity: "天",
    role: "治疗",
    avatar: "avatars/yangyuhuan_a.png",
    portrait: "portraits/yangyuhuan_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/yangyuhuan_b.png",
        portrait: "portraits/yangyuhuan_b.png"
      }
    ]
  },

  {
    id: "libai",
    cardId: 2020,
    name: "李白",
    dynasty: "唐",
    rarity: "天",
    role: "输出",
    avatar: "avatars/libai_a.png",
    portrait: "portraits/libai_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/libai_b.png",
        portrait: "portraits/libai_b.png"
      }
    ]
  },

  {
    id: "dufu",
    cardId: 2021,
    name: "杜甫",
    dynasty: "唐",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/dufu_a.png",
    portrait: "portraits/dufu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/dufu_b.png",
        portrait: "portraits/dufu_b.png"
      }
    ]
  },

  {
    id: "panan",
    cardId: 2022,
    name: "潘安",
    dynasty: "晋",
    rarity: "玄",
    role: "治疗",
    avatar: "avatars/panan_a.png",
    portrait: "portraits/panan_a.png"
  },

  {
    id: "shichong",
    cardId: 2023,
    name: "石崇",
    dynasty: "晋",
    rarity: "玄",
    role: "防御",
    avatar: "avatars/shichong_a.png",
    portrait: "portraits/shichong_a.png"
  },

  {
    id: "lvzhu",
    cardId: 2024,
    name: "绿珠",
    dynasty: "晋",
    rarity: "玄",
    role: "治疗",
    avatar: "avatars/lvzhu_a.png",
    portrait: "portraits/lvzhu_a.png"
  },

  {
    id: "weizheng",
    cardId: 2025,
    name: "魏征",
    dynasty: "唐",
    rarity: "玄",
    role: "输出",
    avatar: "avatars/weizheng_a.png",
    portrait: "portraits/weizheng_a.png"
  },

  {
    id: "baqing",
    cardId: 2026,
    name: "巴清",
    dynasty: "秦",
    rarity: "玄",
    role: "输出",
    avatar: "avatars/baqing_a.png",
    portrait: "portraits/baqing_a.png"
  },

  {
    id: "lishimin",
    cardId: 2028,
    name: "李世民",
    dynasty: "唐",
    rarity: "天",
    role: "输出",
    avatar: "avatars/lishimin_a.png",
    portrait: "portraits/lishimin_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/lishimin_b.png",
        portrait: "portraits/lishimin_b.png"
      }
    ]
  },

  {
    id: "maoyanshou",
    cardId: 2029,
    name: "毛延寿",
    dynasty: "汉",
    rarity: "玄",
    role: "辅助",
    avatar: "avatars/maoyanshou_a.png",
    portrait: "portraits/maoyanshou_a.png"
  },

  {
    id: "yangrongji",
    cardId: 2030,
    name: "杨容姬",
    dynasty: "晋",
    rarity: "玄",
    role: "控制",
    avatar: "avatars/yangrongji_a.png",
    portrait: "portraits/yangrongji_a.png"
  },

  {
    id: "huoqubing",
    cardId: 2031,
    name: "霍去病",
    dynasty: "汉",
    rarity: "地",
    role: "输出",
    avatar: "avatars/huoqubing_a.png",
    portrait: "portraits/huoqubing_a.png"
  },

  {
    id: "zhenfu",
    cardId: 2032,
    name: "甄姬",
    dynasty: "三国",
    rarity: "地",
    role: "输出",
    avatar: "avatars/zhenfu_a.png",
    portrait: "portraits/zhenfu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhenfu_b.png",
        portrait: "portraits/zhenfu_b.png"
      }
    ]
  },

  {
    id: "caozhi",
    cardId: 2033,
    name: "曹植",
    dynasty: "三国",
    rarity: "天",
    role: "输出",
    avatar: "avatars/caozhi_a.png",
    portrait: "portraits/caozhi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/caozhi_b.png",
        portrait: "portraits/caozhi_b.png"
      }
    ]
  },

  {
    id: "xufu",
    cardId: 2034,
    name: "许负",
    dynasty: "汉",
    rarity: "玄",
    role: "辅助",
    avatar: "avatars/xufu_a.png",
    portrait: "portraits/xufu_a.png"
  },

  {
    id: "moye",
    cardId: 2035,
    name: "莫邪",
    dynasty: "梦",
    rarity: "地",
    role: "输出",
    avatar: "avatars/moye_a.png",
    portrait: "portraits/moye_a.png"
  },

  {
    id: "liurushi",
    cardId: 2036,
    name: "柳如是",
    dynasty: "明",
    rarity: "玄",
    role: "输出",
    avatar: "avatars/liurushi_a.png",
    portrait: "portraits/liurushi_a.png"
  },

  {
    id: "xiangyu",
    cardId: 2037,
    name: "项羽",
    dynasty: "西楚",
    rarity: "天",
    role: "控制",
    avatar: "avatars/xiangyu_a.png",
    portrait: "portraits/xiangyu_a.png"
  },

  {
    id: "yuji",
    cardId: 2038,
    name: "虞姬",
    dynasty: "西楚",
    rarity: "地",
    role: "控制",
    avatar: "avatars/yuji_a.png",
    portrait: "portraits/yuji_a.png"
  },

  {
    id: "liuche",
    cardId: 2039,
    name: "刘彻",
    dynasty: "汉",
    rarity: "天",
    role: "输出",
    avatar: "avatars/liuche_a.png",
    portrait: "portraits/liuche_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/liuche_b.png",
        portrait: "portraits/liuche_b.png"
      }
    ]
  },

  {
    id: "weizifu",
    cardId: 2040,
    name: "卫子夫",
    dynasty: "汉",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/weizifu_a.png",
    portrait: "portraits/weizifu_a.png"
  },

  {
    id: "xinqiji",
    cardId: 2041,
    name: "辛弃疾",
    dynasty: "宋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/xinqiji_a.png",
    portrait: "portraits/xinqiji_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/xinqiji_b.png",
        portrait: "portraits/xinqiji_b.png"
      }
    ]
  },

  {
    id: "diqing",
    cardId: 2042,
    name: "狄青",
    dynasty: "宋",
    rarity: "玄",
    role: "输出",
    avatar: "avatars/diqing_a.png",
    portrait: "portraits/diqing_a.png"
  },

  {
    id: "songyingxing",
    cardId: 2043,
    name: "宋应星",
    dynasty: "明",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/songyingxing_a.png",
    portrait: "portraits/songyingxing_a.png"
  },

  {
    id: "wangxizhi",
    cardId: 2044,
    name: "王羲之",
    dynasty: "晋",
    rarity: "地",
    role: "输出",
    avatar: "avatars/wangxizhi_a.png",
    portrait: "portraits/wangxizhi_a.png"
  },

  {
    id: "dazhouhou",
    cardId: 2045,
    name: "大周后",
    dynasty: "五代十国",
    rarity: "玄",
    role: "辅助",
    avatar: "avatars/dazhouhou_a.png",
    portrait: "portraits/dazhouhou_a.png"
  },

  {
    id: "yanjidao",
    cardId: 2046,
    name: "晏几道",
    dynasty: "宋",
    rarity: "地",
    role: "输出",
    avatar: "avatars/yanjidao_a.png",
    portrait: "portraits/yanjidao_a.png"
  },

  {
    id: "sunsimiao",
    cardId: 2047,
    name: "孙思邈",
    dynasty: "唐",
    rarity: "玄",
    role: "治疗",
    avatar: "avatars/sunsimiao_a.png",
    portrait: "portraits/sunsimiao_a.png"
  },

  {
    id: "yuantiangang",
    cardId: 2048,
    name: "袁天罡",
    dynasty: "唐",
    rarity: "玄",
    role: "辅助",
    avatar: "avatars/yuantiangang_a.png",
    portrait: "portraits/yuantiangang_a.png"
  },

  {
    id: "lichunfeng",
    cardId: 2049,
    name: "李淳风",
    dynasty: "唐",
    rarity: "玄",
    role: "输出",
    avatar: "avatars/lichunfeng_a.png",
    portrait: "portraits/lichunfeng_a.png"
  },

  {
    id: "chongyin",
    cardId: 2050,
    name: "崇音",
    dynasty: "梦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/chongyin_a.png",
    portrait: "portraits/chongyin_a.png"
  },

  {
    id: "yinyan",
    cardId: 2051,
    name: "银琰",
    dynasty: "梦",
    rarity: "天",
    role: "控制",
    avatar: "avatars/yinyan_a.png",
    portrait: "portraits/yinyan_a.png"
  },

  {
    id: "wangzhenyi",
    cardId: 2052,
    name: "王贞仪",
    dynasty: "清",
    rarity: "地",
    role: "防御",
    avatar: "avatars/wangzhenyi_a.png",
    portrait: "portraits/wangzhenyi_a.png"
  },

  {
    id: "hongfunv",
    cardId: 2053,
    name: "红拂女",
    dynasty: "唐",
    rarity: "玄",
    role: "输出",
    avatar: "avatars/hongfunv_a.png",
    portrait: "portraits/hongfunv_a.png"
  },

  {
    id: "ganjiang",
    cardId: 2054,
    name: "干将",
    dynasty: "先秦",
    rarity: "玄",
    role: "控制",
    avatar: "avatars/ganjiang_a.png",
    portrait: "portraits/ganjiang_a.png"
  },

  {
    id: "liubang",
    cardId: 2055,
    name: "刘邦",
    dynasty: "汉",
    rarity: "地",
    role: "防御",
    avatar: "avatars/liubang_a.png",
    portrait: "portraits/liubang_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/liubang_b.png",
        portrait: "portraits/liubang_b.png"
      }
    ]
  },

  {
    id: "hanfei",
    cardId: 2056,
    name: "韩非",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/hanfei_a.png",
    portrait: "portraits/hanfei_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/hanfei_b.png",
        portrait: "portraits/hanfei_b.png"
      }
    ]
  },

  {
    id: "lvzhi",
    cardId: 2057,
    name: "吕雉",
    dynasty: "汉",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/lvzhi_a.png",
    portrait: "portraits/lvzhi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/lvzhi_b.png",
        portrait: "portraits/lvzhi_b.png"
      }
    ]
  },

  {
    id: "caopi",
    cardId: 2058,
    name: "曹丕",
    dynasty: "三国",
    rarity: "地",
    role: "输出",
    avatar: "avatars/caopi_a.png",
    portrait: "portraits/caopi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/caopi_b.png",
        portrait: "portraits/caopi_b.png"
      }
    ]
  },

  {
    id: "yuxuanji",
    cardId: 2059,
    name: "鱼玄机",
    dynasty: "唐",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/yuxuanji_a.png",
    portrait: "portraits/yuxuanji_a.png"
  },

  {
    id: "diaochan",
    cardId: 2060,
    name: "貂蝉",
    dynasty: "三国",
    rarity: "天",
    role: "输出",
    avatar: "avatars/diaochan_a.png",
    portrait: "portraits/diaochan_a.png"
  },

  {
    id: "huamulan",
    cardId: 2061,
    name: "花木兰",
    dynasty: "梦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/huamulan_a.png",
    portrait: "portraits/huamulan_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/huamulan_b.png",
        portrait: "portraits/huamulan_b.png"
      }
    ]
  },

  {
    id: "sunce",
    cardId: 2062,
    name: "孙策",
    dynasty: "汉",
    rarity: "天",
    role: "输出",
    avatar: "avatars/sunce_a.png",
    portrait: "portraits/sunce_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/sunce_b.png",
        portrait: "portraits/sunce_b.png"
      }
    ]
  },

  {
    id: "lianghongyu",
    cardId: 2063,
    name: "梁红玉",
    dynasty: "宋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/lianghongyu_a.png",
    portrait: "portraits/lianghongyu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/lianghongyu_b.png",
        portrait: "portraits/lianghongyu_b.png"
      }
    ]
  },

  {
    id: "xishi",
    cardId: 2064,
    name: "西施",
    dynasty: "先秦",
    rarity: "天",
    role: "防御",
    avatar: "avatars/xishi_a.png",
    portrait: "portraits/xishi_a.png"
  },

  {
    id: "xiaoqiao",
    cardId: 2065,
    name: "小乔",
    dynasty: "汉",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/xiaoqiao_a.png",
    portrait: "portraits/xiaoqiao_a.png"
  },

  {
    id: "zhenghe",
    cardId: 2066,
    name: "郑和",
    dynasty: "明",
    rarity: "天",
    role: "输出",
    avatar: "avatars/zhenghe_a.png",
    portrait: "portraits/zhenghe_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhenghe_b.png",
        portrait: "portraits/zhenghe_b.png"
      }
    ]
  },

  {
    id: "zhouyu",
    cardId: 2067,
    name: "周瑜",
    dynasty: "汉",
    rarity: "天",
    role: "输出",
    avatar: "avatars/zhouyu_a.png",
    portrait: "portraits/zhouyu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhouyu_b.png",
        portrait: "portraits/zhouyu_b.png"
      }
    ]
  },

  {
    id: "lanlingwang",
    cardId: 2068,
    name: "高长恭",
    dynasty: "南北朝",
    rarity: "天",
    role: "输出",
    avatar: "avatars/lanlingwang_a.png",
    portrait: "portraits/lanlingwang_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/lanlingwang_b.png",
        portrait: "portraits/lanlingwang_b.png"
      }
    ]
  },

  {
    id: "lishishi",
    cardId: 2069,
    name: "李师师",
    dynasty: "宋",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/lishishi_a.png",
    portrait: "portraits/lishishi_a.png"
  },

  {
    id: "xuanzang",
    cardId: 2070,
    name: "玄奘",
    dynasty: "唐",
    rarity: "天",
    role: "防御",
    avatar: "avatars/xuanzang_a.png",
    portrait: "portraits/xuanzang_a.png"
  },

  {
    id: "zhaoyun",
    cardId: 2071,
    name: "赵云",
    dynasty: "三国",
    rarity: "天",
    role: "输出",
    avatar: "avatars/zhaoyun_a.png",
    portrait: "portraits/zhaoyun_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhaoyun_b.png",
        portrait: "portraits/zhaoyun_b.png"
      }
    ]
  },

  {
    id: "zuchongzhi",
    cardId: 2072,
    name: "祖冲之",
    dynasty: "南北朝",
    rarity: "天",
    role: "治疗",
    avatar: "avatars/zuchongzhi_a.png",
    portrait: "portraits/zuchongzhi_a.png"
  },

  {
    id: "luyou",
    cardId: 2074,
    name: "陆游",
    dynasty: "宋",
    rarity: "天",
    role: "治疗",
    avatar: "avatars/luyou_a.png",
    portrait: "portraits/luyou_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/luyou_b.png",
        portrait: "portraits/luyou_b.png"
      }
    ]
  },

  {
    id: "liqingzhao",
    cardId: 2075,
    name: "李清照",
    dynasty: "宋",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/liqingzhao_a.png",
    portrait: "portraits/liqingzhao_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/liqingzhao_b.png",
        portrait: "portraits/liqingzhao_b.png"
      }
    ]
  },

  {
    id: "fanli",
    cardId: 2077,
    name: "范蠡",
    dynasty: "先秦",
    rarity: "地",
    role: "输出",
    avatar: "avatars/fanli_a.png",
    portrait: "portraits/fanli_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/fanli_b.png",
        portrait: "portraits/fanli_b.png"
      }
    ]
  },

  {
    id: "daqiao",
    cardId: 2078,
    name: "大乔",
    dynasty: "汉",
    rarity: "地",
    role: "控制",
    avatar: "avatars/daqiao_a.png",
    portrait: "portraits/daqiao_a.png"
  },

  {
    id: "xiedaoyun",
    cardId: 2082,
    name: "谢道韫",
    dynasty: "晋",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/xiedaoyun_a.png",
    portrait: "portraits/xiedaoyun_a.png"
  },

  {
    id: "lisi",
    cardId: 2083,
    name: "李斯",
    dynasty: "秦",
    rarity: "天",
    role: "治疗",
    avatar: "avatars/lisi_a.png",
    portrait: "portraits/lisi_a.png"
  },

  {
    id: "jiangziya",
    cardId: 2085,
    name: "姜太公",
    dynasty: "先秦",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/jiangziya_a.png",
    portrait: "portraits/jiangziya_a.png"
  },

  {
    id: "quyuan",
    cardId: 2086,
    name: "屈原",
    dynasty: "先秦",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/quyuan_a.png",
    portrait: "portraits/quyuan_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/quyuan_b.png",
        portrait: "portraits/quyuan_b.png"
      }
    ]
  },

  {
    id: "yuqian",
    cardId: 2087,
    name: "于谦",
    dynasty: "明",
    rarity: "天",
    role: "输出",
    avatar: "avatars/yuqian_a.png",
    portrait: "portraits/yuqian_a.png"
  },

  {
    id: "fengmenglong",
    cardId: 2088,
    name: "冯梦龙",
    dynasty: "明",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/fengmenglong_a.png",
    portrait: "portraits/fengmenglong_a.png"
  },

  {
    id: "tangbohu",
    cardId: 2089,
    name: "唐伯虎",
    dynasty: "明",
    rarity: "天",
    role: "控制",
    avatar: "avatars/tangbohu_a.png",
    portrait: "portraits/tangbohu_a.png"
  },

  {
    id: "huangdaopo",
    cardId: 2090,
    name: "黄道婆",
    dynasty: "元",
    rarity: "天",
    role: "防御",
    avatar: "avatars/huangdaopo_a.png",
    portrait: "portraits/huangdaopo_a.png"
  },

  {
    id: "zhaokuangyin",
    cardId: 2092,
    name: "赵匡胤",
    dynasty: "宋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/zhaokuangyin_a.png",
    portrait: "portraits/zhaokuangyin_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhaokuangyin_b.png",
        portrait: "portraits/zhaokuangyin_b.png"
      }
    ]
  },

  {
    id: "wangyangming",
    cardId: 2099,
    name: "王阳明",
    dynasty: "明",
    rarity: "天",
    role: "输出",
    avatar: "avatars/wangyangming_a.png",
    portrait: "portraits/wangyangming_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/wangyangming_b.png",
        portrait: "portraits/wangyangming_b.png"
      }
    ]
  },

  {
    id: "zhaomengfu",
    cardId: 2100,
    name: "赵孟頫",
    dynasty: "元",
    rarity: "天",
    role: "防御",
    avatar: "avatars/zhaomengfu_a.png",
    portrait: "portraits/zhaomengfu_a.png"
  },

  {
    id: "guandaosheng",
    cardId: 2101,
    name: "管道昇",
    dynasty: "元",
    rarity: "天",
    role: "防御",
    avatar: "avatars/guandaosheng_a.png",
    portrait: "portraits/guandaosheng_a.png"
  },

  {
    id: "gongsundaniang",
    cardId: 2103,
    name: "公孙大娘",
    dynasty: "唐",
    rarity: "地",
    role: "控制",
    avatar: "avatars/gongsundaniang_a.png",
    portrait: "portraits/gongsundaniang_a.png"
  },

  {
    id: "tangxianzu",
    cardId: 2107,
    name: "汤显祖",
    dynasty: "明",
    rarity: "天",
    role: "控制",
    avatar: "avatars/tangxianzu_a.png",
    portrait: "portraits/tangxianzu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/tangxianzu_b.png",
        portrait: "portraits/tangxianzu_b.png"
      },
      {
        id: "c",
        avatar: "avatars/tangxianzu_c.png",
        portrait: "portraits/tangxianzu_c.png"
      }
    ]
  },

  {
    id: "taoyuanming",
    cardId: 2110,
    name: "陶渊明",
    dynasty: "晋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/taoyuanming_a.png",
    portrait: "portraits/taoyuanming_a.png"
  },

  {
    id: "liue",
    cardId: 2111,
    name: "刘娥",
    dynasty: "宋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/liue_a.png",
    portrait: "portraits/liue_a.png"
  },

  {
    id: "hanxin",
    cardId: 2112,
    name: "韩信",
    dynasty: "汉",
    rarity: "天",
    role: "输出",
    avatar: "avatars/hanxin_a.png",
    portrait: "portraits/hanxin_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/hanxin_b.png",
        portrait: "portraits/hanxin_b.png"
      }
    ]
  },

  {
    id: "ouyangxiu",
    cardId: 2113,
    name: "欧阳修",
    dynasty: "宋",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/ouyangxiu_a.png",
    portrait: "portraits/ouyangxiu_a.png"
  },

  {
    id: "pusongling",
    cardId: 2117,
    name: "蒲松龄",
    dynasty: "清",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/pusongling_a.png",
    portrait: "portraits/pusongling_a.png"
  },

  {
    id: "zhuyuanzhang",
    cardId: 2118,
    name: "朱元璋",
    dynasty: "明",
    rarity: "天",
    role: "输出",
    avatar: "avatars/zhuyuanzhang_a.png",
    portrait: "portraits/zhuyuanzhang_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhuyuanzhang_b.png",
        portrait: "portraits/zhuyuanzhang_b.png"
      }
    ]
  },

  {
    id: "mahuanghou",
    cardId: 2119,
    name: "马皇后",
    dynasty: "明",
    rarity: "地",
    role: "治疗",
    avatar: "avatars/mahuanghou_a.png",
    portrait: "portraits/mahuanghou_a.png"
  },

  {
    id: "wanganshi",
    cardId: 2120,
    name: "王安石",
    dynasty: "宋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/wanganshi_a.png",
    portrait: "portraits/wanganshi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/wanganshi_b.png",
        portrait: "portraits/wanganshi_b.png"
      }
    ]
  },

  {
    id: "liyu",
    cardId: 2133,
    name: "李煜",
    dynasty: "五代十国",
    rarity: "天",
    role: "控制",
    avatar: "avatars/liyu_a.png",
    portrait: "portraits/liyu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/liyu_b.png",
        portrait: "portraits/liyu_b.png"
      }
    ]
  },

  {
    id: "zhangqian",
    cardId: 2121,
    name: "张骞",
    dynasty: "汉",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/zhangqian_a.png",
    portrait: "portraits/zhangqian_a.png"
  },

  {
    id: "jieyougongzhu",
    cardId: 2122,
    name: "解忧公主",
    dynasty: "汉",
    rarity: "地",
    role: "防御",
    avatar: "avatars/jieyougongzhu_a.png",
    portrait: "portraits/jieyougongzhu_a.png"
  },

  {
    id: "wuzixu",
    cardId: 2123,
    name: "伍子胥",
    dynasty: "先秦",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/wuzixu_a.png",
    portrait: "portraits/wuzixu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/wuzixu_b.png",
        portrait: "portraits/wuzixu_b.png"
      }
    ]
  },

  {
    id: "goujian",
    cardId: 2124,
    name: "勾践",
    dynasty: "先秦",
    rarity: "天",
    role: "防御",
    avatar: "avatars/goujian_a.png",
    portrait: "portraits/goujian_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/goujian_b.png",
        portrait: "portraits/goujian_b.png"
      }
    ]
  },

  {
    id: "fuchai",
    cardId: 2125,
    name: "夫差",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/fuchai_a.png",
    portrait: "portraits/fuchai_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/fuchai_b.png",
        portrait: "portraits/fuchai_b.png"
      }
    ]
  },

  {
    id: "baijuyi",
    cardId: 2127,
    name: "白居易",
    dynasty: "唐",
    rarity: "天",
    role: "治疗",
    avatar: "avatars/baijuyi_a.png",
    portrait: "portraits/baijuyi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/baijuyi_b.png",
        portrait: "portraits/baijuyi_b.png"
      }
    ]
  },

  {
    id: "zhuangzhou",
    cardId: 2131,
    name: "庄周",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/zhuangzhou_a.png",
    portrait: "portraits/zhuangzhou_a.png"
  },

  {
    id: "baiqi",
    cardId: 2132,
    name: "白起",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/baiqi_a.png",
    portrait: "portraits/baiqi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/baiqi_d.png",
        portrait: "portraits/baiqi_b.png"
      }
    ]
  },

  {
    id: "xuetao",
    cardId: 2134,
    name: "薛涛",
    dynasty: "唐",
    rarity: "地",
    role: "防御",
    avatar: "avatars/xuetao_a.png",
    portrait: "portraits/xuetao_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/xuetao_b.png",
        portrait: "portraits/xuetao_b.png"
      }
    ]
  },

  {
    id: "direnjie",
    cardId: 2135,
    name: "狄仁杰",
    dynasty: "唐",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/direnjie_a.png",
    portrait: "portraits/direnjie_a.png"
  },

  {
    id: "yuanzhen",
    cardId: 2136,
    name: "元稹",
    dynasty: "唐",
    rarity: "地",
    role: "防御",
    avatar: "avatars/yuanzhen_a.png",
    portrait: "portraits/yuanzhen_a.png"
  },

  {
    id: "wangshifu",
    cardId: 2137,
    name: "王实甫",
    dynasty: "元",
    rarity: "地",
    role: "防御",
    avatar: "avatars/wangshifu_a.png",
    portrait: "portraits/wangshifu_a.png"
  },

  {
    id: "simaqian",
    cardId: 2138,
    name: "司马迁",
    dynasty: "汉",
    rarity: "天",
    role: "控制",
    avatar: "avatars/simaqian_a.png",
    portrait: "portraits/simaqian_a.png",
    skins: [
      {
        id: "d",
        avatar: "avatars/simaqian_d.png",
        portrait: "portraits/simaqian_d.png"
      }
    ]
  },

  {
    id: "simaguang",
    cardId: 2139,
    name: "司马光",
    dynasty: "宋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/simaguang_a.png",
    portrait: "portraits/simaguang_a.png"
  },

  {
    id: "banzhao",
    cardId: 2140,
    name: "班昭",
    dynasty: "汉",
    rarity: "地",
    role: "输出",
    avatar: "avatars/banzhao_a.png",
    portrait: "portraits/banzhao_a.png"
  },

  {
    id: "caoxueqin",
    cardId: 2141,
    name: "曹雪芹",
    dynasty: "清",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/caoxueqin_a.png",
    portrait: "portraits/caoxueqin_a.png"
  },

  {
    id: "sunwu",
    cardId: 2142,
    name: "孙武",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/sunwu_a.png",
    portrait: "portraits/sunwu_a.png"
  },

  {
    id: "douyifang",
    cardId: 2143,
    name: "窦猗房",
    dynasty: "汉",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/douyifang_a.png",
    portrait: "portraits/douyifang_a.png"
  },

  {
    id: "modi",
    cardId: 2144,
    name: "墨翟",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/modi_a.png",
    portrait: "portraits/modi_a.png"
  },

  {
    id: "gongshuban",
    cardId: 2145,
    name: "公输班",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/gongshuban_a.png",
    portrait: "portraits/gongshuban_a.png"
  },

  {
    id: "liuxiu",
    cardId: 2146,
    name: "刘秀",
    dynasty: "汉",
    rarity: "天",
    role: "输出",
    avatar: "avatars/liuxiu_a.png",
    portrait: "portraits/liuxiu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/liuxiu_b.png",
        portrait: "portraits/liuxiu_b.png"
      }
    ]
  },

  {
    id: "yinlihua",
    cardId: 2147,
    name: "阴丽华",
    dynasty: "汉",
    rarity: "地",
    role: "治疗",
    avatar: "avatars/yinlihua_a.png",
    portrait: "portraits/yinlihua_a.png"
  },

  {
    id: "qijiguang",
    cardId: 2148,
    name: "戚继光",
    dynasty: "明",
    rarity: "天",
    role: "防御",
    avatar: "avatars/qijiguang_a.png",
    portrait: "portraits/qijiguang_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/qijiguang_b.png",
        portrait: "portraits/qijiguang_b.png"
      }
    ]
  },

  {
    id: "zhangjuzheng",
    cardId: 2149,
    name: "张居正",
    dynasty: "明",
    rarity: "天",
    role: "输出",
    avatar: "avatars/zhangjuzheng_a.png",
    portrait: "portraits/zhangjuzheng_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhangjuzheng_b.png",
        portrait: "portraits/zhangjuzheng_b.png"
      }
    ]
  },

  {
    id: "lishangyin",
    cardId: 2151,
    name: "李商隐",
    dynasty: "唐",
    rarity: "天",
    role: "治疗",
    avatar: "avatars/lishangyin_a.png",
    portrait: "portraits/lishangyin_a.png"
  },

  {
    id: "xiaochuo",
    cardId: 2152,
    name: "萧绰",
    dynasty: "辽",
    rarity: "天",
    role: "输出",
    avatar: "avatars/xiaochuo_a.png",
    portrait: "portraits/xiaochuo_a.png"
  },

  {
    id: "luyu",
    cardId: 2153,
    name: "陆羽",
    dynasty: "唐",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/luyu_a.png",
    portrait: "portraits/luyu_a.png"
  },

  {
    id: "libing",
    cardId: 2154,
    name: "李冰",
    dynasty: "先秦",
    rarity: "天",
    role: "控制",
    avatar: "avatars/libing_a.png",
    portrait: "portraits/libing_a.png"
  },

  {
    id: "xuxiake",
    cardId: 2155,
    name: "徐霞客",
    dynasty: "明",
    rarity: "天",
    role: "输出",
    avatar: "avatars/xuxiake_a.png",
    portrait: "portraits/xuxiake_a.png"
  },

  {
    id: "shexiang",
    cardId: 2156,
    name: "奢香",
    dynasty: "明",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/shexiang_a.png",
    portrait: "portraits/shexiang_a.png"
  },

  {
    id: "zhudi",
    cardId: 2159,
    name: "朱棣",
    dynasty: "明",
    rarity: "天",
    role: "输出",
    avatar: "avatars/zhudi_a.png",
    portrait: "portraits/zhudi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/zhudi_b.png",
        portrait: "portraits/zhudi_b.png"
      }
    ]
  },

  {
    id: "lijing",
    cardId: 2160,
    name: "李靖",
    dynasty: "唐",
    rarity: "天",
    role: "防御",
    avatar: "avatars/lijing_a.png",
    portrait: "portraits/lijing_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/lijing_b.png",
        portrait: "portraits/lijing_b.png"
      }
    ]
  },

  {
    id: "mengtian",
    cardId: 2161,
    name: "蒙恬",
    dynasty: "秦",
    rarity: "天",
    role: "防御",
    avatar: "avatars/mengtian_a.png",
    portrait: "portraits/mengtian_a.png"
  },

  {
    id: "wuchengen",
    cardId: 2162,
    name: "吴承恩",
    dynasty: "明",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/wuchengen_a.png",
    portrait: "portraits/wuchengen_a.png",
    skins: [
      {
        id: "d",
        avatar: "avatars/wuchengen_d.png",
        portrait: "portraits/wuchengen_d.png"
      },
      {
        id: "e",
        avatar: "avatars/wuchengen_e.png",
        portrait: "portraits/wuchengen_e.png"
      }
    ]
  },

  {
    id: "jifa",
    cardId: 2163,
    name: "姬发",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/jifa_a.png",
    portrait: "portraits/jifa_a.png"
  },

  {
    id: "dengsui",
    cardId: 2164,
    name: "邓绥",
    dynasty: "汉",
    rarity: "天",
    role: "治疗",
    avatar: "avatars/dengsui_a.png",
    portrait: "portraits/dengsui_a.png"
  },

  {
    id: "songci",
    cardId: 2165,
    name: "宋慈",
    dynasty: "宋",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/songci_a.png",
    portrait: "portraits/songci_a.png"
  },

  {
    id: "shangyang",
    cardId: 2166,
    name: "商鞅",
    dynasty: "先秦",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/shangyang_a.png",
    portrait: "portraits/shangyang_a.png"
  },

  {
    id: "yuanhong",
    cardId: 2167,
    name: "元宏",
    dynasty: "南北朝",
    rarity: "天",
    role: "控制",
    avatar: "avatars/yuanhong_a.png",
    portrait: "portraits/yuanhong_a.png"
  },

  {
    id: "liuyuxi",
    cardId: 2168,
    name: "刘禹锡",
    dynasty: "唐",
    rarity: "天",
    role: "输出",
    avatar: "avatars/liuyuxi_a.png",
    portrait: "portraits/liuyuxi_a.png"
  },

  {
    id: "zhugeliang",
    cardId: 2169,
    name: "诸葛亮",
    dynasty: "三国",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/zhugeliang_b.png",
    portrait: "portraits/zhugeliang_b.png",
    skins: [
      {
        id: "c",
        avatar: "avatars/zhugeliang_c.png",
        portrait: "portraits/zhugeliang_c.png"
      },
      {
        id: "d",
        avatar: "avatars/zhugeliang_d.png",
        portrait: "portraits/zhugeliang_d.png"
      },
      {
        id: "h",
        avatar: "avatars/zhugeliang_h.png",
        portrait: "portraits/zhugeliang_h.png"
      }
    ]
  },

  {
    id: "liubingyi",
    cardId: 2170,
    name: "刘病已",
    dynasty: "汉",
    rarity: "天",
    role: "输出",
    avatar: "avatars/liubingyi_a.png",
    portrait: "portraits/liubingyi_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/liubingyi_b.png",
        portrait: "portraits/liubingyi_b.png"
      }
    ]
  },

  {
    id: "yuefei",
    cardId: 2171,
    name: "岳飞",
    dynasty: "宋",
    rarity: "天",
    role: "输出",
    avatar: "avatars/yuefei_a.png",
    portrait: "portraits/yuefei_a.png"
  },

  {
    id: "zhangzeduan",
    cardId: 2172,
    name: "张择端",
    dynasty: "宋",
    rarity: "天",
    role: "防御",
    avatar: "avatars/zhangzeduan_a.png",
    portrait: "portraits/zhangzeduan_a.png"
  },

  {
    id: "chairong",
    cardId: 2173,
    name: "柴荣",
    dynasty: "五代十国",
    rarity: "天",
    role: "控制",
    avatar: "avatars/chairong_a.png",
    portrait: "portraits/chairong_a.png"
  },

  {
    id: "suqin",
    cardId: 2174,
    name: "苏秦",
    dynasty: "先秦",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/suqin_a.png",
    portrait: "portraits/suqin_a.png"
  },

  {
    id: "zhangyi",
    cardId: 2175,
    name: "张仪",
    dynasty: "先秦",
    rarity: "天",
    role: "辅助",
    avatar: "avatars/zhangyi_a.png",
    portrait: "portraits/zhangyi_a.png"
  },

  {
    id: "yuanbaoguai",
    cardId: 2508,
    name: "招财灵",
    dynasty: "不详",
    rarity: "黄",
    role: "治疗",
    avatar: "avatars/yuanbaoguai_a.png",
    portrait: "portraits/yuanbaoguai_a.png"
  },

  {
    id: "baoxiang",
    cardId: 2509,
    name: "守财灵",
    dynasty: "不详",
    rarity: "黄",
    role: "防御",
    avatar: "avatars/baoxiang_a.png",
    portrait: "portraits/baoxiang_a.png"
  },

  {
    id: "bicai",
    cardId: 2510,
    name: "笔才",
    dynasty: "不详",
    rarity: "黄",
    role: "辅助",
    avatar: "avatars/bicai_a.png",
    portrait: "portraits/bicai_a.png"
  },

  {
    id: "mohen",
    cardId: 2511,
    name: "墨痕",
    dynasty: "不详",
    rarity: "黄",
    role: "辅助",
    avatar: "avatars/mohen_a.png",
    portrait: "portraits/mohen_a.png"
  },

  {
    id: "zhisi",
    cardId: 2512,
    name: "纸思",
    dynasty: "不详",
    rarity: "黄",
    role: "控制",
    avatar: "avatars/zhisi_a.png",
    portrait: "portraits/zhisi_b.png"
  },

  {
    id: "yanhun",
    cardId: 2513,
    name: "砚魂",
    dynasty: "不详",
    rarity: "黄",
    role: "辅助",
    avatar: "avatars/yanhun_a.png",
    portrait: "portraits/yanhun_a.png"
  },

  {
    id: "niangungun",
    cardId: 2514,
    name: "鲶滚滚",
    dynasty: "不详",
    rarity: "黄",
    role: "防御",
    avatar: "avatars/niangungun_a.png",
    portrait: "portraits/niangungun_a.png"
  },

  {
    id: "meizhi",
    cardId: 2529,
    name: "妹至",
    dynasty: "不详",
    rarity: "黄",
    role: "输出",
    avatar: "avatars/meizhi_a.png",
    portrait: "portraits/meizhi_a.png"
  },

  {
    id: "yutu",
    cardId: 2531,
    name: "因因",
    dynasty: "不详",
    rarity: "黄",
    role: "辅助",
    avatar: "avatars/yutu_a.png",
    portrait: "portraits/yutu_a.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/yutu_b.png",
        portrait: "portraits/yutu_b.png"
      }
    ]
  },

  {
    id: "shuiche",
    cardId: 2534,
    name: "汲水轮",
    dynasty: "不详",
    rarity: "天",
    role: "输出",
    avatar: "avatars/shuiche_a.png",
    portrait: "portraits/shuiche_a.png"
  },

  {
    id: "pusonglinghuli",
    cardId: 2539,
    name: "狐灵",
    dynasty: "不详",
    rarity: "地",
    role: "输出",
    avatar: "avatars/pusonglinghuli_a.png",
    portrait: "portraits/pusonglinghuli_a.png"
  },

  {
    id: "sunwulou",
    cardId: 2541,
    name: "孙悟喽",
    dynasty: "不详",
    rarity: "天",
    role: "输出",
    avatar: "avatars/sunwulou_a.png",
    portrait: "portraits/sunwulou_a.png"
  },

  {
    id: "liubei",
    cardId: 2569,
    name: "刘备",
    dynasty: "三国",
    rarity: "天",
    role: "输出",
    avatar: "avatars/liubei_a.png",
    portrait: "portraits/liubei_a.png"
  },

  {
    id: "qilin",
    cardId: 2500,
    name: "麒麟",
    dynasty: "不详",
    rarity: "天",
    role: "不详",
    avatar: "avatars/qilin_a.png",
    portrait: "portraits/qilin_a.png"
  },

  {
    id: "liuma",
    cardId: 2669,
    name: "流马",
    dynasty: "不详",
    rarity: "黄",
    role: "不详",
    avatar: "avatars/liuma_a.png",
    portrait: "portraits/liuma_a.png"
  },

  {
    id: "muniu",
    cardId: 2769,
    name: "木牛",
    dynasty: "不详",
    rarity: "黄",
    role: "不详",
    avatar: "avatars/muniu_a.png",
    portrait: "portraits/muniu_a.png"
  },

  {
    id: "zhuqiyu",
    cardId: 2587,
    name: "朱祁钰",
    dynasty: "明",
    rarity: "地",
    role: "辅助",
    avatar: "avatars/zhuqiyu_a.png",
    portrait: "portraits/zhuqiyu_a.png"
  },

  {
    id: "bage",
    cardId: 5045,
    name: "小芳",
    dynasty: "唐",
    rarity: "黄",
    role: "输出",
    avatar: "avatars/bage_a.png",
    portrait: "portraits/bage_a.png"
  },

  {
    id: "xuantaihou",
    cardId: 2176,
    name: "宣太后",
    dynasty: "先秦",
    rarity: "天",
    role: "输出",
    avatar: "avatars/xuantaihou_a.png",
    portrait: "portraits/xuantaihou_a.png"
  },

  {
    id: "sunquan",
    cardId: 2177,
    name: "孙权",
    dynasty: "三国",
    rarity: "天",
    role: "控制",
    avatar: "avatars/sunquan_b.png",
    portrait: "portraits/sunquan_b.png",
    skins: [
      {
        id: "b",
        avatar: "avatars/sunquan_a.png",
        portrait: "portraits/sunquan_a.png"
      }
    ]
  }
];
