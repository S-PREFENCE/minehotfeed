"""
HotFeed 聚合热点 - 全局配置模块
"""

# 数据库文件路径
import os

# 项目根目录（backend 目录）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 数据存储目录
DATA_DIR = os.path.join(BASE_DIR, "data")
DATABASE_PATH = os.path.join(DATA_DIR, "hotfeed.db")

# 调度器配置
FETCH_INTERVAL_MINUTES = 10  # 每 10 分钟抓取一次

# 去重配置
DEDUP_SIMILARITY_THRESHOLD = 0.72  # 余弦相似度阈值

# 数据清理配置
DATA_RETENTION_DAYS = 7  # 保留最近 7 天的数据

# 历史热搜配置
HISTORY_RETENTION_DAYS = 3  # 保留前 3 天的 Top 15
HISTORY_TOP_N = 15  # 每天保留前 15 条

# 国内平台列表 (UAPIS API，人民日报改用 RSS)
DOMESTIC_PLATFORMS = {
    "weibo": "微博",
    "douyin": "抖音",
    "baidu": "百度",
    "zhihu": "知乎",
    "toutiao": "头条",
    "bilibili": "B站",
    "kuaishou": "快手",
    "xiaohongshu": "小红书",
    "tencent-news": "腾讯新闻",
    "netease-news": "网易新闻",
    "hupu": "虎扑",
}

# 国际平台列表 (RSS/API)
INTERNATIONAL_PLATFORMS = {
    "google_news": "Google News",
    "bbc": "BBC",
    "cnn": "CNN",
    "reddit": "Reddit",
    "youtube": "YouTube",
}

# UAPIS 基础 URL
UAPIS_BASE_URL = "https://uapis.cn/api/v1/misc/hotboard"

# RSS 源配置（国内人民日报 + 国际源）
RSS_FEEDS = {
    "people": "http://www.people.com.cn/rss/politics.xml",
    "google_news": "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
    "bbc": "https://feeds.bbci.co.uk/news/rss.xml",
    "cnn": "https://rss.cnn.com/rss/edition.rss",
    "youtube": "https://www.youtube.com/feeds/videos.xml?playlist_id=PLrEnWoR732-D4VKb2qNRHn8aGkR0uDMtG",
}

# Reddit API
REDDIT_HOT_URL = "https://www.reddit.com/r/all/hot.json"

# 分类关键词映射
CATEGORY_KEYWORDS = {
    "科技": ["科技", "AI", "人工智能", "芯片", "手机", "苹果", "华为", "特斯拉", "SpaceX", "Google", "Apple", "Microsoft", "5G", "机器人", "大模型", "ChatGPT", "GPT", "算法", "数据", "编程", "软件", "硬件", "互联网", "电商"],
    "娱乐": ["娱乐", "电影", "音乐", "明星", "综艺", "电视剧", "综艺节目", "演出", "演唱会", "艺", "歌", "剧", "MV", "综艺", "网红", "直播", "短视频"],
    "财经": ["财经", "股票", "基金", "A股", "美股", "港股", "比特币", "加密货币", "金融", "投资", "经济", "GDP", "通胀", "利率", "央行", "银行", "保险", "房地产", "房价", "汇率", "贸易"],
    "体育": ["体育", "足球", "篮球", "NBA", "世界杯", "奥运会", "欧冠", "英超", "中超", "C罗", "梅西", "詹姆斯", "库里", "网球", "F1", "马拉松", "电竞", "比赛", "决赛", "联赛"],
    "社会": ["社会", "政策", "法律", "民生", "教育", "医疗", "环境", "交通", "天气", "地震", "事故", "安全", "犯罪", "法院", "政府", "改革"],
}

# 趋势状态
TREND_STATES = ["rising", "falling", "stable"]
