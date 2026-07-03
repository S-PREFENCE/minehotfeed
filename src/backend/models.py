"""
HotFeed 聚合热点 - 数据模型
定义原始热点和去重热点的数据结构
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional
import json


@dataclass
class RawHotspot:
    """原始热点数据（单平台单条记录）"""
    platform: str
    region: str
    title: str
    original_heat: float = 0.0
    rank: int = 0
    url: str = ""
    tags: list = field(default_factory=list)
    thumbnail: str = ""
    fetched_at: Optional[datetime] = None
    batch_id: str = ""
    id: Optional[int] = None

    def to_dict(self) -> dict:
        result = asdict(self)
        result["tags"] = json.dumps(self.tags, ensure_ascii=False)
        if self.fetched_at:
            result["fetched_at"] = self.fetched_at.isoformat()
        return result

    def to_insert_tuple(self) -> tuple:
        """返回用于 INSERT 的元组"""
        return (
            self.platform,
            self.region,
            self.title,
            self.original_heat,
            self.rank,
            self.url,
            json.dumps(self.tags, ensure_ascii=False),
            self.thumbnail,
            self.fetched_at.isoformat() if self.fetched_at else datetime.now().isoformat(),
            self.batch_id,
        )


@dataclass
class DedupHotspot:
    """去重后的热点数据（多平台合并）"""
    id: str
    title: str
    subtitle: str = ""
    unified_heat: float = 0.0
    category: str = "社会"
    trend: str = "stable"
    primary_source_id: Optional[int] = None
    secondary_source_ids: list = field(default_factory=list)
    region: str = "domestic"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "subtitle": self.subtitle,
            "unified_heat": round(self.unified_heat, 1),
            "category": self.category,
            "trend": self.trend,
            "primary_source_id": self.primary_source_id,
            "secondary_source_ids": json.dumps(self.secondary_source_ids),
            "region": self.region,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
