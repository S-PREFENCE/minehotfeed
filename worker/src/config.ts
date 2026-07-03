// HotFeed — Cloudflare Worker 后端
// 功能：抓取热点 + 去重 + D1 存储 + Cron 定时任务

export interface Env {
  DB: D1Database;
}

// ============ 配置 ============
const UAPIS_BASE = "https://uapis.cn/api/v1/misc/hotboard";

const DOMESTIC_PLATFORMS: Record<string, string> = {
  weibo: "微博",
  douyin: "抖音",
  baidu: "百度",
  zhihu: "知乎",
  toutiao: "头条",
  bilibili: "B站",
  kuaishou: "快手",
  xiaohongshu: "小红书",
  "tencent-news": "腾讯新闻",
  "netease-news": "网易新闻",
  hupu: "虎扑",
};

const RSS_FEEDS: Record<string, { name: string; url: string; region: string }> = {
  people: {
    name: "人民日报",
    url: "http://www.people.com.cn/rss/politics.xml",
    region: "domestic",
  },
  google_news: {
    name: "Google News",
    url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
    region: "international",
  },
  bbc: {
    name: "BBC",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
    region: "international",
  },
  cnn: {
    name: "CNN",
    url: "https://rss.cnn.com/rss/edition.rss",
    region: "international",
  },
};

const REDDIT_URL = "https://www.reddit.com/r/all/hot.json";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  科技: [
    "科技", "AI", "人工智能", "芯片", "手机", "苹果", "华为",
    "特斯拉", "SpaceX", "Google", "Apple", "Microsoft", "5G", "机器人",
    "大模型", "ChatGPT", "GPT", "算法", "数据", "编程", "软件",
    "硬件", "互联网", "电商",
  ],
  娱乐: [
    "娱乐", "电影", "音乐", "明星", "综艺", "电视剧", "综艺节目",
    "演出", "演唱会", "艺", "歌", "剧", "MV", "网红", "直播", "短视频",
  ],
  财经: [
    "财经", "股票", "基金", "A股", "美股", "港股", "比特币",
    "加密货币", "金融", "投资", "经济", "GDP", "通胀", "利率", "央行",
    "银行", "保险", "房地产", "房价", "汇率", "贸易",
  ],
  体育: [
    "体育", "足球", "篮球", "NBA", "世界杯", "奥运会", "欧冠",
    "英超", "中超", "C罗", "梅西", "詹姆斯", "库里", "网球", "F1",
    "马拉松", "电竞", "比赛", "决赛", "联赛",
  ],
  社会: [
    "社会", "政策", "法律", "民生", "教育", "医疗", "环境",
    "交通", "天气", "地震", "事故", "安全", "犯罪", "法院", "政府", "改革",
  ],
};

const DEDUP_THRESHOLD = 0.65;
