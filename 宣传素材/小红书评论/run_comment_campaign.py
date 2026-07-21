#!/usr/bin/env python3
"""
小红书评论推广试跑脚本 · 小咪的光学迷宫

用法:
  python run_comment_campaign.py --target 10
  python run_comment_campaign.py --target 10 --dry-run
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import subprocess
import sys
import time
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TZ = timezone(timedelta(hours=8))
SCRIPT_DIR = Path(__file__).resolve().parent
RUN_LOG_PATH: Path | None = None
CAMPAIGN_LOCK_PATH = SCRIPT_DIR / ".campaign.lock"
REDBOOK_DIR = Path.home() / ".agents" / "skills" / "redbookskills"
MESSAGES_PATH = SCRIPT_DIR / "推广语轮播.json"
RECORDS_PATH = SCRIPT_DIR / "已回复记录.json"

RELEVANCE_KEYWORDS = (
    "益智",
    "烧脑",
    "推箱",
    "解谜",
    "迷宫",
    "游戏",
    "小游戏",
    "逻辑",
    "脑力",
    "推荐",
    "微信",
    "休闲",
    "闯关",
    "谜题",
    "推理",
)

# 搜索词：组合词为主；同一词会用「综合/最新」两种排序各搜一次，并滚动加载更多结果
SEARCH_KEYWORDS = [
    "益智小游戏",
    "烧脑小游戏",
    "推箱子",
    "解谜游戏",
    "游戏推荐",
    "微信小游戏",
    "迷宫游戏",
    "逻辑游戏",
    "休闲小游戏",
    "单机小游戏",
    "解谜小游戏",
    "益智游戏推荐",
    "烧脑游戏推荐",
    "打发时间小游戏",
    "闯关游戏",
    "推理游戏",
    "脑力游戏",
    "光学解谜",
    "光线迷宫",
    "微信游戏推荐",
    "小游戏安利",
]

SEARCH_SORT_VARIANTS = ("综合", "最新")
DEFAULT_SEARCH_SCROLLS = 8  # 单次搜索最多滚动次数；有可用帖则提前停止
DEFAULT_SEARCH_PUBLISH_TIME = "半年内"


def build_search_tasks() -> list[dict[str, str]]:
    """每个关键词 × 排序方式 = 独立搜索任务，扩大结果面。"""
    tasks: list[dict[str, str]] = []
    for keyword in SEARCH_KEYWORDS:
        for sort_by in SEARCH_SORT_VARIANTS:
            tasks.append(
                {
                    "keyword": keyword,
                    "sort_by": sort_by,
                    "publish_time": DEFAULT_SEARCH_PUBLISH_TIME,
                }
            )
    return tasks

NEGATIVE_KEYWORDS = (
    "带货",
    "优惠券",
    "抽奖",
    "医美",
    "减肥",
    "穿搭",
    "口红",
    "恐怖",
    "翌日",
    "肉鸽",
    "射击",
    "化妆",
    "恋爱",
    "steam",
)

STRONG_RELEVANCE_KEYWORDS = (
    "益智",
    "烧脑",
    "推箱",
    "解谜",
    "迷宫",
    "逻辑",
    "脑力",
    "闯关",
    "谜题",
    "推理",
    "推箱子",
    "小游戏",
)


DEFAULT_RATE_LIMITS = {
    "minIntervalSeconds": 20,
    "maxIntervalSeconds": 30,
    "maxPerHour": 0,
    "maxPerDay": 100,
    "circuitBreakerHours": 24,
    "searchIntervalSecondsMin": 5,
    "searchIntervalSecondsMax": 15,
    "detailFetchIntervalSecondsMin": 2,
    "detailFetchIntervalSecondsMax": 4,
}


class CaptchaBlockedError(Exception):
    """CDP 输出中出现验证码页，应立刻停止 campaign。"""


def safe_print(text: str) -> None:
    try:
        print(text)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "utf-8"
        print(text.encode(enc, errors="replace").decode(enc, errors="replace"))
    if RUN_LOG_PATH is not None:
        try:
            with RUN_LOG_PATH.open("a", encoding="utf-8") as f:
                f.write(text + "\n")
        except OSError:
            pass


def init_run_log() -> Path:
    """每次运行写入带时间戳的 campaign_*.log，便于事后排查。"""
    global RUN_LOG_PATH
    stamp = datetime.now(TZ).strftime("%Y-%m-%d_%H%M%S")
    RUN_LOG_PATH = SCRIPT_DIR / f"campaign_{stamp}.log"
    safe_print(f"[log-file] {RUN_LOG_PATH}")
    return RUN_LOG_PATH


PLATFORM_RATE_LIMIT_MARKERS = (
    "请求太频繁",
    "太频繁",
    "请稍后再试",
    "操作过于频繁",
    "访问过于频繁",
    "rate limit",
    "Rate limit",
    "too many requests",
)

CAPTCHA_MARKERS = (
    "website-login/captcha",
    "/captcha?",
    "verifyUuid=",
    "verifyType=",
    "verifyBiz=",
)


CDP_LOG_LINE_MARKERS = (
    "cdp_publish]",
    "CDPError",
    "Traceback",
    "NOT_LOGGED",
    "Timed out",
    "请求太频繁",
    "Direct navigate",
    "Already on search",
    "Search completed",
    "SEARCH_FEEDS_RESULT",
    "POST_COMMENT",
    "POST_COMMENT_RESULT",
    "Login confirmed",
    "login confirmed",
    "fail",
    "error",
    "Error",
)


def is_platform_rate_limited(text: str) -> bool:
    return any(marker in (text or "") for marker in PLATFORM_RATE_LIMIT_MARKERS)


def is_captcha_challenge(text: str) -> bool:
    lowered = (text or "").lower()
    return any(marker.lower() in lowered for marker in CAPTCHA_MARKERS)


def cdp_cmd_summary(args: list[str]) -> str:
    """日志里不打印完整评论正文，只保留命令摘要。"""
    parts: list[str] = []
    i = 0
    while i < len(args):
        token = args[i]
        if token == "--content" and i + 1 < len(args):
            parts.append(f"--content({len(args[i + 1])}chars)")
            i += 2
            continue
        if token == "--xsec-token" and i + 1 < len(args):
            parts.append(f"--xsec-token({len(args[i + 1])}chars)")
            i += 2
            continue
        parts.append(token)
        i += 1
    return " ".join(parts)


def extract_cdp_highlights(output: str, *, max_lines: int = 16) -> list[str]:
    lines: list[str] = []
    for line in (output or "").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if any(marker in stripped for marker in CDP_LOG_LINE_MARKERS):
            lines.append(stripped)
    if not lines and output:
        tail = output.strip().splitlines()
        lines = [ln.strip() for ln in tail[-5:] if ln.strip()]
    return lines[-max_lines:]


def log_cdp_result(
    phase: str,
    *,
    args: list[str] | None = None,
    code: int,
    output: str,
    extra: str = "",
) -> None:
    summary = cdp_cmd_summary(args) if args else ""
    suffix = f" {extra}" if extra else ""
    safe_print(f"[cdp] phase={phase} exit={code}{suffix}")
    if summary:
        safe_print(f"[cdp] cmd={summary}")
    for line in extract_cdp_highlights(output):
        safe_print(f"[cdp]   {line}")
    if is_captcha_challenge(output):
        safe_print("[stop-captcha] CDP 输出含验证码页，请手动过验证后再跑")
    if is_platform_rate_limited(output):
        safe_print("[platform-rate-limit] CDP 输出含限频/警告文案，建议停止并冷却 3~7 天")


def load_rate_limits(messages_cfg: dict[str, Any]) -> dict[str, Any]:
    limits = dict(DEFAULT_RATE_LIMITS)
    custom = messages_cfg.get("rateLimits") or {}
    if isinstance(custom, dict):
        allowed = set(DEFAULT_RATE_LIMITS) | {
            "limitUnit",
            "minIntervalMinutes",
            "maxIntervalMinutes",
            "detailFetchIntervalSecondsMin",
            "detailFetchIntervalSecondsMax",
        }
        limits.update({k: v for k, v in custom.items() if k in allowed})
    return limits


def comment_interval_bounds(limits: dict[str, Any]) -> tuple[float, float]:
    """帖间等待：优先秒，兼容旧版分钟配置。"""
    if "minIntervalSeconds" in limits or "maxIntervalSeconds" in limits:
        lo = float(limits.get("minIntervalSeconds", 60))
        hi = float(limits.get("maxIntervalSeconds", 120))
    else:
        lo = float(limits.get("minIntervalMinutes", 2)) * 60
        hi = float(limits.get("maxIntervalMinutes", 4)) * 60
    if hi < lo:
        lo, hi = hi, lo
    return lo, hi


def format_comment_interval(limits: dict[str, Any]) -> str:
    lo, hi = comment_interval_bounds(limits)
    return f"{int(lo)}-{int(hi)}s"


def parse_iso_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ)
        return dt.astimezone(TZ)
    except ValueError:
        return None


def count_recent_posts(records: dict[str, Any], since: datetime) -> int:
    """限速按帖数：同一 feedId 的一级 + 楼中楼只计 1 帖。"""
    seen: set[str] = set()
    for item in records.get("records") or []:
        if item.get("commentType") == "dry-run":
            continue
        feed_id = str(item.get("feedId") or "")
        if not feed_id or feed_id in seen:
            continue
        ts = parse_iso_datetime(str(item.get("commentedAt") or ""))
        if ts and ts >= since:
            seen.add(feed_id)
    return len(seen)


def check_circuit_breaker(records: dict[str, Any], now: datetime) -> tuple[bool, str]:
    until_raw = str(records.get("circuitBreakerUntil") or "")
    until = parse_iso_datetime(until_raw)
    if until and now < until:
        reason = str(records.get("circuitBreakerReason") or "unknown")
        return False, f"circuit breaker active until {until.isoformat()} ({reason})"
    return True, ""


def trigger_circuit_breaker(
    records: dict[str, Any],
    *,
    reason: str,
    hours: float,
    now: datetime,
) -> None:
    until = now + timedelta(hours=hours)
    records["circuitBreakerUntil"] = until.isoformat(timespec="seconds")
    records["circuitBreakerReason"] = reason
    records["circuitBreakerTriggeredAt"] = now.isoformat(timespec="seconds")
    records["updatedAt"] = now.isoformat(timespec="seconds")


def check_rate_limits(
    records: dict[str, Any],
    limits: dict[str, Any],
    now: datetime,
) -> tuple[bool, str]:
    hour_ago = now - timedelta(hours=1)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hourly = count_recent_posts(records, hour_ago)
    daily = count_recent_posts(records, day_start)
    max_hour = int(limits["maxPerHour"])
    max_day = int(limits["maxPerDay"])
    if max_hour > 0 and hourly >= max_hour:
        return False, f"hourly post limit reached ({hourly}/{max_hour})"
    if daily >= max_day:
        return False, f"daily post limit reached ({daily}/{max_day})"
    return True, ""


def wait_for_rate_limits(
    records: dict[str, Any],
    limits: dict[str, Any],
) -> bool:
    """遇小时限速则等待；日限额已满则返回 False。"""
    while True:
        now = datetime.now(TZ)
        ok, msg = check_rate_limits(records, limits, now)
        if ok:
            return True
        if "daily post limit" in msg:
            safe_print(f"[rate-limit] {msg}")
            return False
        safe_print(f"[rate-limit] waiting 60s: {msg}")
        time.sleep(60)


def random_comment_wait_seconds(limits: dict[str, Any]) -> int:
    lo, hi = comment_interval_bounds(limits)
    return max(1, int(random.uniform(lo, hi)))


def random_search_wait_seconds(limits: dict[str, Any]) -> float:
    lo = float(limits["searchIntervalSecondsMin"])
    hi = float(limits["searchIntervalSecondsMax"])
    if hi < lo:
        lo, hi = hi, lo
    return random.uniform(lo, hi)


def random_detail_fetch_wait_seconds(limits: dict[str, Any]) -> float:
    lo = float(limits.get("detailFetchIntervalSecondsMin", 2))
    hi = float(limits.get("detailFetchIntervalSecondsMax", 4))
    if hi < lo:
        lo, hi = hi, lo
    return random.uniform(lo, hi)


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_records(records: dict[str, Any]) -> dict[str, Any]:
    """从 records[] 重建 commentedPosts / commentedAuthors / likedPosts，防止索引与明细不一致。"""
    records.setdefault("records", [])
    posts: list[str] = []
    authors: list[str] = []
    liked_posts: list[str] = [str(x) for x in (records.get("likedPosts") or []) if str(x)]
    seen_posts: set[str] = set()
    seen_authors: set[str] = set()
    seen_liked: set[str] = set(liked_posts)
    for item in records["records"]:
        if item.get("commentType") == "dry-run":
            continue
        feed_id = str(item.get("feedId") or "")
        author_id = str(item.get("authorId") or "")
        if feed_id and feed_id not in seen_posts:
            seen_posts.add(feed_id)
            posts.append(feed_id)
        if author_id and author_id not in seen_authors:
            seen_authors.add(author_id)
            authors.append(author_id)
        if feed_id and (item.get("upvoteConfirmed") or item.get("liked")) and feed_id not in seen_liked:
            seen_liked.add(feed_id)
            liked_posts.append(feed_id)
    records["commentedPosts"] = posts
    records["commentedAuthors"] = authors
    records["likedPosts"] = liked_posts
    return records


def load_records() -> dict[str, Any]:
    if not RECORDS_PATH.exists():
        return normalize_records(
            {"records": [], "commentedPosts": [], "commentedAuthors": [], "likedPosts": []}
        )
    return normalize_records(load_json(RECORDS_PATH))


def _read_lock_pid(path: Path) -> int | None:
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


@contextmanager
def campaign_instance_lock():
    """禁止多进程同时跑 campaign，避免记录文件互相覆盖导致同一帖重复评论。"""
    while True:
        try:
            fd = os.open(str(CAMPAIGN_LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            break
        except FileExistsError:
            old_pid = _read_lock_pid(CAMPAIGN_LOCK_PATH)
            if old_pid and _pid_alive(old_pid):
                raise SystemExit(
                    f"[error] another campaign is running (pid={old_pid}). "
                    "Stop it before starting a new one."
                )
            try:
                CAMPAIGN_LOCK_PATH.unlink(missing_ok=True)
            except OSError:
                time.sleep(0.5)
    safe_print(f"[lock] campaign instance pid={os.getpid()}")
    try:
        yield
    finally:
        try:
            CAMPAIGN_LOCK_PATH.unlink(missing_ok=True)
        except OSError:
            pass


def commit_comment_record(
    *,
    feed_id: str,
    feed_title: str,
    author_id: str,
    author_nickname: str,
    keyword: str,
    message_id: int,
    message_text: str,
    comment_type: str,
    comment_count: int,
    message_category: str = "",
    match_score: int = 0,
    upvote_confirmed: bool = False,
) -> tuple[bool, dict[str, Any]]:
    """写盘前重新加载记录；若 feed/作者已存在则跳过（防重复评论）。"""
    records = load_records()
    if is_seen(records, feed_id, author_id):
        safe_print(f"[skip-dup-save] feedId={feed_id} already in records on disk")
        return False, records
    append_record(
        records,
        feed_id=feed_id,
        feed_title=feed_title,
        author_id=author_id,
        author_nickname=author_nickname,
        keyword=keyword,
        message_id=message_id,
        message_text=message_text,
        comment_type=comment_type,
        comment_count=comment_count,
        message_category=message_category,
        match_score=match_score,
        upvote_confirmed=upvote_confirmed,
    )
    if upvote_confirmed:
        remember_liked_post(records, feed_id)
    normalize_records(records)
    save_json(RECORDS_PATH, records)
    return True, records


def run_cdp(args: list[str], timeout: int = 180) -> tuple[int, str]:
    cmd = [sys.executable, str(REDBOOK_DIR / "scripts" / "cdp_publish.py"), *args]
    safe_print(f"[cdp] spawn timeout={timeout}s cmd={cdp_cmd_summary(args)}")
    started = time.time()
    proc = subprocess.run(
        cmd,
        cwd=str(REDBOOK_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    elapsed = time.time() - started
    output = (proc.stdout or "") + (proc.stderr or "")
    safe_print(
        f"[cdp] done exit={proc.returncode} elapsed={elapsed:.1f}s "
        f"stdout={len(proc.stdout or '')} stderr={len(proc.stderr or '')}"
    )
    return proc.returncode, output


def extract_json_block(output: str, marker: str) -> dict[str, Any] | None:
    idx = output.find(marker)
    if idx < 0:
        return None
    raw = output[idx + len(marker) :].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def parse_publish_date(text: str, now: datetime) -> datetime | None:
    text = (text or "").strip()
    if not text:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return datetime.strptime(text, "%Y-%m-%d").replace(tzinfo=TZ)
    m = re.fullmatch(r"(\d{2})-(\d{2})", text)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        year = now.year
        candidate = datetime(year, month, day, tzinfo=TZ)
        if candidate > now + timedelta(days=1):
            candidate = datetime(year - 1, month, day, tzinfo=TZ)
        return candidate
    if "天前" in text:
        m2 = re.search(r"(\d+)天前", text)
        if m2:
            return now - timedelta(days=int(m2.group(1)))
    if text in ("今天", "刚刚", "昨天"):
        delta = 0 if text != "昨天" else 1
        return now - timedelta(days=delta)
    return None


def feed_title(feed: dict[str, Any]) -> str:
    card = feed.get("noteCard") or {}
    return str(card.get("displayTitle") or card.get("title") or "").strip()


def is_usable_feed_title(title: str) -> bool:
    """过滤空标题、undefined 占位、hot_query 等非笔记卡片残留。"""
    text = (title or "").strip()
    if not text:
        return False
    lowered = text.lower()
    if lowered in ("undefined", "null", "none"):
        return False
    return True


def is_note_feed(feed: dict[str, Any]) -> bool:
    model_type = feed.get("modelType")
    if model_type in ("hot_query", "rec_query", "ads", "banner"):
        return False
    return model_type in (None, "note")


def feed_comment_count(feed: dict[str, Any]) -> int:
    card = feed.get("noteCard") or {}
    info = card.get("interactInfo") or {}
    raw = info.get("commentCount") or "0"
    try:
        return int(str(raw).replace(",", ""))
    except ValueError:
        return 0


def parse_interact_liked(payload: dict[str, Any] | None) -> bool | None:
    """从 feed / detail 对象读取当前账号是否已点赞；未知则返回 None。"""
    if not isinstance(payload, dict):
        return None
    info = payload.get("interactInfo")
    if isinstance(info, dict) and "liked" in info:
        return bool(info.get("liked"))
    note_card = payload.get("noteCard")
    if isinstance(note_card, dict):
        card_info = note_card.get("interactInfo")
        if isinstance(card_info, dict) and "liked" in card_info:
            return bool(card_info.get("liked"))
    note = payload.get("note")
    if isinstance(note, dict):
        nested = parse_interact_liked(note)
        if nested is not None:
            return nested
    items = payload.get("items")
    if isinstance(items, dict):
        nested = parse_interact_liked(items)
        if nested is not None:
            return nested
    return None


def feed_is_liked_by_account(feed: dict[str, Any]) -> bool | None:
    """搜索列表 feed 卡片上的 liked 状态（需已登录）。"""
    card = feed.get("noteCard") or {}
    info = card.get("interactInfo") or feed.get("interactInfo") or {}
    if isinstance(info, dict) and "liked" in info:
        return bool(info.get("liked"))
    return None


def feed_author(feed: dict[str, Any]) -> tuple[str, str]:
    card = feed.get("noteCard") or {}
    user = card.get("user") or {}
    return str(user.get("userId") or ""), str(user.get("nickName") or user.get("nickname") or "")


def feed_publish_text(feed: dict[str, Any]) -> str:
    card = feed.get("noteCard") or {}
    tags = card.get("cornerTagInfo") or []
    for tag in tags:
        if tag.get("type") == "publish_time":
            return str(tag.get("text") or "")
    return ""


def relevance_score(text: str) -> int:
    """对标题+正文等合并文本打相关度分。"""
    text = (text or "").strip()
    if not text:
        return -99
    score = 0
    text_lower = text.lower()
    has_strong = any(kw in text for kw in STRONG_RELEVANCE_KEYWORDS)
    for kw in RELEVANCE_KEYWORDS:
        if kw in text:
            score += 2
    for kw in NEGATIVE_KEYWORDS:
        if kw in text or kw.lower() in text_lower:
            score -= 12
    if not has_strong and "推荐" not in text and "求" not in text:
        score -= 4
    return score


def extract_note_content_from_detail(detail: dict[str, Any]) -> str:
    """从 get-feed-detail 返回的 detail 对象提取正文/描述。"""
    if not isinstance(detail, dict):
        return ""
    chunks: list[str] = []

    def add_text(val: Any) -> None:
        if isinstance(val, str):
            text = val.strip()
            if text and text not in chunks:
                chunks.append(text)

    note = detail.get("note")
    if isinstance(note, dict):
        for key in ("desc", "description", "content", "title", "displayTitle"):
            add_text(note.get(key))
        note_card = note.get("noteCard")
        if isinstance(note_card, dict):
            add_text(note_card.get("displayTitle"))
            add_text(note_card.get("desc"))

    for key in ("desc", "description", "content", "title", "displayTitle"):
        add_text(detail.get(key))

    return "\n".join(chunks)


def fetch_feed_content_text(
    feed_id: str,
    xsec_token: str,
    *,
    cache: dict[str, str],
    liked_cache: dict[str, bool | None] | None = None,
    detail_wait_limits: dict[str, Any] | None = None,
    detail_nav_count: list[int] | None = None,
) -> tuple[str, bool, bool | None]:
    """点进帖子读取正文；返回 (正文, 是否成功, 是否已点赞)。同一次搜索内连续点详情会间隔等待。"""
    if feed_id in cache:
        liked = liked_cache.get(feed_id) if liked_cache is not None else None
        return cache[feed_id], True, liked

    if detail_nav_count is not None:
        if detail_nav_count[0] > 0 and detail_wait_limits:
            wait_s = random_detail_fetch_wait_seconds(detail_wait_limits)
            safe_print(f"[detail-wait] {wait_s:.1f}s before feedId={feed_id}")
            time.sleep(wait_s)
        detail_nav_count[0] += 1

    cdp_args = [
        "--reuse-existing-tab",
        "get-feed-detail",
        "--feed-id",
        feed_id,
        "--xsec-token",
        xsec_token,
    ]
    code, output = run_cdp(cdp_args, timeout=90)
    if is_captcha_challenge(output):
        raise CaptchaBlockedError(f"captcha on get-feed-detail feedId={feed_id}")
    if code != 0 or is_platform_rate_limited(output):
        cache[feed_id] = ""
        if liked_cache is not None:
            liked_cache[feed_id] = None
        return "", False, None

    result = extract_json_block(output, "GET_FEED_DETAIL_RESULT:")
    if not isinstance(result, dict):
        cache[feed_id] = ""
        if liked_cache is not None:
            liked_cache[feed_id] = None
        return "", False, None

    detail = result.get("detail") or {}
    body = extract_note_content_from_detail(detail)
    liked = parse_interact_liked(detail if isinstance(detail, dict) else None)
    cache[feed_id] = body
    if liked_cache is not None:
        liked_cache[feed_id] = liked
    return body, True, liked


def score_post_relevance(title: str, body: str) -> int:
    """标题 + 正文合并打分（正文权重通过更多关键词命中体现）。"""
    title = (title or "").strip()
    body = (body or "").strip()
    if body:
        return relevance_score(f"{title}\n{body}")
    return relevance_score(title)


def max_secondary_replies(comment_count: int, rate: float = 0.05) -> int:
    """对已有评论做楼中楼回复的上限（5%-10% 向上取整，至少 0）。"""
    if comment_count <= 0:
        return 0
    return max(0, math.ceil(comment_count * rate))


# 分类级语义信号（与 messages[].matchKeywords 叠加）
CATEGORY_SIGNALS: dict[str, tuple[str, ...]] = {
    "求推荐": ("求", "推荐", "有没有", "类似", "安利", "什么游戏", "游戏推荐", "求安利"),
    "推箱子": ("推箱", "推箱子", "sokoban", "箱子"),
    "微信小游戏": ("微信", "小游戏", "小程序", "不用下载", "碎片", "ipad"),
    "烧脑卡关": ("烧脑", "卡关", "难", "过不了", "攻略", "脑子", "逻辑", "解谜"),
}


def build_post_context(candidate: dict[str, Any]) -> str:
    """合并标题、正文与命中搜索词，供语义选文案。"""
    return " ".join(
        part
        for part in (
            str(candidate.get("title") or ""),
            str(candidate.get("contentText") or ""),
            str(candidate.get("keyword") or ""),
        )
        if part
    )


def build_reply_context(post_title: str, reply_text: str) -> str:
    """楼中楼：帖子标题 + 被回复评论正文。"""
    return " ".join(part for part in (post_title, reply_text) if part)


def score_message_for_context(context: str, msg: dict[str, Any]) -> int:
    if not context:
        return 0
    score = 0
    for kw in msg.get("matchKeywords") or []:
        if kw and kw in context:
            score += 3
    category = str(msg.get("category") or "")
    for kw in CATEGORY_SIGNALS.get(category, ()):
        if kw in context:
            score += 2
    return score


def pick_message_for_context(
    context: str,
    messages_cfg: dict[str, Any],
    used_ids: set[int],
) -> tuple[dict[str, Any], int]:
    """
    按帖子/评论语义从 20 条中选最贴切的一条；同分随机，无信号则降级随机。
    """
    messages = messages_cfg.get("messages") or []
    pool = [m for m in messages if m.get("id") not in used_ids]
    if not pool:
        pool = messages
    scored = [(score_message_for_context(context, m), m) for m in pool]
    best = max(s for s, _ in scored)
    if best <= 0:
        chosen = random.choice(pool)
        return chosen, 0
    top = [m for s, m in scored if s == best]
    return random.choice(top), best


def pick_message(messages_cfg: dict[str, Any], used_ids: set[int]) -> dict[str, Any]:
    """兼容旧调用：无上下文时随机。"""
    msg, _ = pick_message_for_context("", messages_cfg, used_ids)
    return msg


def is_seen(records: dict[str, Any], feed_id: str, author_id: str) -> bool:
    if feed_id in set(records.get("commentedPosts") or []):
        return True
    if author_id and author_id in set(records.get("commentedAuthors") or []):
        return True
    return False


def is_liked(
    records: dict[str, Any],
    feed_id: str,
    *,
    feed: dict[str, Any] | None = None,
    detail_liked: bool | None = None,
) -> bool:
    if feed_id in set(records.get("likedPosts") or []):
        return True
    if feed is not None:
        feed_liked = feed_is_liked_by_account(feed)
        if feed_liked is True:
            return True
    if detail_liked is True:
        return True
    return False


def remember_liked_post(records: dict[str, Any], feed_id: str, *, persist: bool = False) -> bool:
    """记入 likedPosts；persist=True 时立即写盘。"""
    records.setdefault("likedPosts", [])
    if feed_id in records["likedPosts"]:
        return False
    records["likedPosts"].append(feed_id)
    records["updatedAt"] = datetime.now(TZ).isoformat(timespec="seconds")
    if persist:
        save_json(RECORDS_PATH, records)
    return True


def should_skip_feed(
    records: dict[str, Any],
    feed_id: str,
    author_id: str,
    *,
    feed: dict[str, Any] | None = None,
    detail_liked: bool | None = None,
) -> tuple[bool, str]:
    """已评论或已点赞则跳过（避免重复触达/重复点赞）。"""
    if is_seen(records, feed_id, author_id):
        return True, "already_commented"
    if is_liked(records, feed_id, feed=feed, detail_liked=detail_liked):
        return True, "already_liked"
    return False, ""


def append_record(
    records: dict[str, Any],
    *,
    feed_id: str,
    feed_title: str,
    author_id: str,
    author_nickname: str,
    keyword: str,
    message_id: int,
    message_text: str,
    comment_type: str,
    comment_count: int,
    message_category: str = "",
    match_score: int = 0,
    upvote_confirmed: bool = False,
) -> None:
    now_iso = datetime.now(TZ).isoformat(timespec="seconds")
    records.setdefault("commentedPosts", [])
    records.setdefault("commentedAuthors", [])
    records.setdefault("likedPosts", [])
    records.setdefault("records", [])
    if feed_id not in records["commentedPosts"]:
        records["commentedPosts"].append(feed_id)
    if author_id and author_id not in records["commentedAuthors"]:
        records["commentedAuthors"].append(author_id)
    if upvote_confirmed and feed_id not in records["likedPosts"]:
        records["likedPosts"].append(feed_id)
    records["records"].append(
        {
            "feedId": feed_id,
            "feedTitle": feed_title,
            "authorId": author_id,
            "authorNickname": author_nickname,
            "keyword": keyword,
            "messageId": message_id,
            "messageText": message_text,
            "commentType": comment_type,
            "feedCommentCount": comment_count,
            "messageCategory": message_category,
            "matchScore": match_score,
            "upvoteConfirmed": upvote_confirmed,
            "commentedAt": now_iso,
        }
    )
    records["updatedAt"] = now_iso


def _filter_feeds_to_candidates(
    feeds: list[dict[str, Any]],
    *,
    keyword: str,
    records: dict[str, Any],
    seen_feed_ids: set[str],
    max_age_days: int,
    min_relevance: int,
    now: datetime,
    detail_content_cache: dict[str, str],
    detail_liked_cache: dict[str, bool | None] | None = None,
    max_candidates: int = 1,
    detail_wait_limits: dict[str, Any] | None = None,
    detail_nav_count: list[int] | None = None,
) -> tuple[list[dict[str, Any]], int, Counter[str]]:
    """将搜索原始 feeds 过滤为可发评候选（点进详情读正文后打相关度分）；默认命中即停。"""
    candidates: list[dict[str, Any]] = []
    skipped = 0
    skip_reasons: Counter[str] = Counter()

    for feed in feeds:
        if not is_note_feed(feed):
            skipped += 1
            skip_reasons["not_note"] += 1
            continue
        feed_id = str(feed.get("id") or "")
        if not feed_id or feed_id in seen_feed_ids:
            skipped += 1
            skip_reasons["dup_or_empty_id"] += 1
            continue
        seen_feed_ids.add(feed_id)

        title = feed_title(feed)
        if not is_usable_feed_title(title):
            skipped += 1
            skip_reasons["bad_title"] += 1
            continue
        author_id, author_nickname = feed_author(feed)
        skip, skip_reason = should_skip_feed(records, feed_id, author_id, feed=feed)
        if skip:
            skipped += 1
            skip_reasons[skip_reason] += 1
            if skip_reason == "already_liked":
                if remember_liked_post(records, feed_id, persist=True):
                    safe_print(f"[skip-liked] feedId={feed_id} title={title[:28]} (saved to likedPosts)")
                else:
                    safe_print(f"[skip-liked] feedId={feed_id} title={title[:28]}")
            continue

        pub_text = feed_publish_text(feed)
        pub_dt = parse_publish_date(pub_text, now)
        if pub_dt is None:
            skipped += 1
            skip_reasons["bad_publish_date"] += 1
            continue
        age_days = (now - pub_dt).days
        if age_days > max_age_days:
            skipped += 1
            skip_reasons["too_old"] += 1
            continue

        xsec = str(feed.get("xsecToken") or "")
        if not xsec:
            skipped += 1
            skip_reasons["no_xsec"] += 1
            continue

        body_text, detail_ok, detail_liked = fetch_feed_content_text(
            feed_id,
            xsec,
            cache=detail_content_cache,
            liked_cache=detail_liked_cache,
            detail_wait_limits=detail_wait_limits,
            detail_nav_count=detail_nav_count,
        )
        if detail_ok:
            skip, skip_reason = should_skip_feed(
                records,
                feed_id,
                author_id,
                feed=feed,
                detail_liked=detail_liked,
            )
            if skip:
                skipped += 1
                skip_reasons[skip_reason] += 1
                if skip_reason == "already_liked":
                    remember_liked_post(records, feed_id, persist=True)
                    safe_print(
                        f"[skip-liked] feedId={feed_id} title={title[:28]} "
                        f"(detail liked={detail_liked})"
                    )
                continue
        if not detail_ok:
            skipped += 1
            skip_reasons["detail_fetch_failed"] += 1
            continue

        score = score_post_relevance(title, body_text)
        if score < min_relevance:
            skipped += 1
            skip_reasons["low_relevance"] += 1
            safe_print(
                f"[relevance-skip] feedId={feed_id} title={title[:28]} "
                f"bodyLen={len(body_text)} score={score} min={min_relevance}"
            )
            continue

        comment_count = feed_comment_count(feed)
        candidates.append(
            {
                "feedId": feed_id,
                "xsecToken": xsec,
                "title": title,
                "contentText": body_text,
                "authorId": author_id,
                "authorNickname": author_nickname,
                "keyword": keyword,
                "publishText": pub_text,
                "publishDate": pub_dt.isoformat(),
                "ageDays": age_days,
                "commentCount": comment_count,
                "relevanceScore": score,
                "maxSecondaryReplies": max_secondary_replies(comment_count, 0.05),
            }
        )
        if max_candidates > 0 and len(candidates) >= max_candidates:
            break

    candidates.sort(key=lambda x: (-x["relevanceScore"], x["ageDays"], -x["commentCount"]))
    return candidates, skipped, skip_reasons


def search_one_keyword(
    keyword: str,
    records: dict[str, Any],
    *,
    seen_feed_ids: set[str],
    max_age_days: int,
    min_relevance: int,
    now: datetime,
    sort_by: str | None = None,
    publish_time: str | None = None,
    search_scrolls: int = DEFAULT_SEARCH_SCROLLS,
    detail_wait_limits: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], int, int, bool, bool]:
    """
    只搜索一个关键词，返回 (至多 1 条合格帖, 原始 feeds 数, 跳过数, 是否疑似平台限频, 是否验证码)。
    同一搜索会话：首屏逐条细筛，>=min_relevance 即停并返回，直接发评；无命中则同页下滚再筛。
    不在此函数内 sleep，由调用方在「下一次搜索前」等待。
    """
    candidates: list[dict[str, Any]] = []
    skipped = 0
    skip_reasons: Counter[str] = Counter()
    raw_count = 0
    rate_limited = False
    captcha_blocked = False
    max_scrolls = max(0, int(search_scrolls))
    scrolls_used = 0
    detail_content_cache: dict[str, str] = {}
    detail_liked_cache: dict[str, bool | None] = {}
    detail_nav_count = [0]

    def _process_feeds(feeds: list[dict[str, Any]], scroll_step: int) -> list[dict[str, Any]]:
        nonlocal skipped, raw_count, scrolls_used, captcha_blocked
        raw_count = max(raw_count, len(feeds))
        try:
            step_candidates, step_skipped, step_skip_reasons = _filter_feeds_to_candidates(
                feeds,
                keyword=keyword,
                records=records,
                seen_feed_ids=seen_feed_ids,
                max_age_days=max_age_days,
                min_relevance=min_relevance,
                now=now,
                detail_content_cache=detail_content_cache,
                detail_liked_cache=detail_liked_cache,
                max_candidates=1,
                detail_wait_limits=detail_wait_limits,
                detail_nav_count=detail_nav_count,
            )
        except CaptchaBlockedError:
            captcha_blocked = True
            return []
        skipped += step_skipped
        skip_reasons.update(step_skip_reasons)
        scrolls_used = scroll_step
        return step_candidates

    cdp_args = ["--reuse-existing-tab", "search-feeds", "--keyword", keyword]
    if sort_by:
        cdp_args.extend(["--sort-by", sort_by])
    if publish_time:
        cdp_args.extend(["--publish-time", publish_time])

    code, output = run_cdp(cdp_args)
    rate_limited = is_platform_rate_limited(output)
    if is_captcha_challenge(output):
        safe_print(f"[stop-captcha] search-feeds 命中验证码页 keyword={keyword}")
        log_cdp_result("search-captcha", args=cdp_args, code=code, output=output, extra=f"keyword={keyword}")
        return candidates, raw_count, skipped, rate_limited, True
    if code != 0:
        safe_print(f"[warn] search failed keyword={keyword} scrolls=0")
        log_cdp_result("search", args=cdp_args, code=code, output=output, extra=f"keyword={keyword}")
        return candidates, raw_count, skipped, rate_limited, captcha_blocked

    result = extract_json_block(output, "SEARCH_FEEDS_RESULT:")
    if not result:
        safe_print(f"[warn] no search json keyword={keyword} scrolls=0")
        log_cdp_result("search-no-json", args=cdp_args, code=code, output=output, extra=f"keyword={keyword}")
        return candidates, raw_count, skipped, rate_limited, captcha_blocked

    nav_count = result.get("navigateCount")
    current_url = str(result.get("currentUrl") or result.get("url") or "")
    if nav_count is not None or current_url:
        safe_print(
            f"[search-meta] keyword={keyword} navigateCount={nav_count} "
            f"url={current_url[:120] if current_url else '-'}"
        )

    feeds = result.get("feeds") or []
    candidates = _process_feeds(feeds, 0)
    if captcha_blocked:
        return candidates, raw_count, skipped, rate_limited, True
    if candidates:
        if max_scrolls > 0:
            safe_print(
                f"[search-scroll-stop] keyword={keyword} sort={sort_by or '-'} "
                f"usable={len(candidates)} after scrolls=0 "
                f"(max={max_scrolls}, skip further scrolls)"
            )
    else:
        for scroll_step in range(1, max_scrolls + 1):
            safe_print(
                f"[search-scroll-next] keyword={keyword} sort={sort_by or '-'} "
                f"raw={raw_count} usable=0 scroll once ({scroll_step}/{max_scrolls})"
            )
            scroll_args = ["--reuse-existing-tab", "search-feeds-scroll"]
            code, output = run_cdp(scroll_args)
            rate_limited = rate_limited or is_platform_rate_limited(output)
            if is_captcha_challenge(output):
                safe_print(f"[stop-captcha] search-feeds-scroll 命中验证码页 keyword={keyword}")
                log_cdp_result(
                    "search-scroll-captcha",
                    args=scroll_args,
                    code=code,
                    output=output,
                    extra=f"keyword={keyword} scrolls={scroll_step}",
                )
                captcha_blocked = True
                break
            if code != 0:
                safe_print(f"[warn] search scroll failed keyword={keyword} scrolls={scroll_step}")
                log_cdp_result(
                    "search-scroll",
                    args=scroll_args,
                    code=code,
                    output=output,
                    extra=f"keyword={keyword} scrolls={scroll_step}",
                )
                break

            scroll_result = extract_json_block(output, "SEARCH_FEEDS_SCROLL_RESULT:")
            if not scroll_result:
                safe_print(f"[warn] no scroll json keyword={keyword} scrolls={scroll_step}")
                break

            feeds = scroll_result.get("feeds") or []
            if not feeds:
                safe_print(
                    f"[search-scroll-stop] keyword={keyword} sort={sort_by or '-'} "
                    f"no new feeds after scrolls={scroll_step}"
                )
                break

            candidates = _process_feeds(feeds, scroll_step)
            if captcha_blocked:
                break
            if candidates:
                safe_print(
                    f"[search-scroll-stop] keyword={keyword} sort={sort_by or '-'} "
                    f"usable={len(candidates)} after scrolls={scroll_step} "
                    f"(max={max_scrolls}, skip further scrolls)"
                )
                break

    if captcha_blocked:
        return candidates, raw_count, skipped, rate_limited, True

    if skip_reasons:
        scroll_note = (
            f"scrolls={scrolls_used}"
            if candidates
            else f"scrolls={scrolls_used}(exhausted max={max_scrolls})"
        )
        safe_print(
            f"[search-filter] keyword={keyword} sort={sort_by or '-'} "
            f"{scroll_note} {dict(skip_reasons)}"
        )
    if raw_count == 0:
        log_cdp_result("search-empty", args=cdp_args, code=code, output=output, extra=f"keyword={keyword}")
    return candidates, raw_count, skipped, rate_limited, captcha_blocked


CDP_LOCK_PATH = Path.home() / "AppData/Local/Temp/post_to_xhs_publish.lock"

INFRA_FAILURE_MARKERS = (
    "Another publish process is running",
    "post_to_xhs_publish.lock",
    "run_lock.py",
    "FileExistsError",
)


def is_infrastructure_failure(detail: str) -> bool:
    return any(marker in detail for marker in INFRA_FAILURE_MARKERS)


def clear_cdp_lock() -> None:
    try:
        CDP_LOCK_PATH.unlink(missing_ok=True)
    except OSError:
        pass


def parse_post_comment_result(output: str) -> dict[str, Any] | None:
    return extract_json_block(output, "POST_COMMENT_RESULT:")


def post_comment(feed_id: str, xsec_token: str, content: str) -> tuple[bool, str, bool]:
    cdp_args = [
        "--reuse-existing-tab",
        "post-comment-to-feed",
        "--feed-id",
        feed_id,
        "--xsec-token",
        xsec_token,
        "--content",
        content,
        "--also-upvote",
    ]
    safe_print(f"[post] attempt feedId={feed_id} contentLen={len(content)} also_upvote=1")
    code, output = run_cdp(cdp_args, timeout=120)
    result = parse_post_comment_result(output)
    ok = code == 0 and bool(result and result.get("success"))
    upvote_ok = False
    if result:
        upvote = result.get("upvote") or {}
        upvote_ok = bool(upvote.get("success")) and bool(upvote.get("state_after"))
        if ok and not upvote_ok:
            safe_print(
                f"[upvote-warn] feedId={feed_id} comment ok but like not confirmed "
                f"upvote={upvote}"
            )
        elif upvote_ok:
            safe_print(
                f"[upvote] confirmed feedId={feed_id} "
                f"changed={upvote.get('changed')} state_after={upvote.get('state_after')}"
            )
    detail = output[-1200:] if output else ""
    if ok:
        safe_print(f"[post] success feedId={feed_id}")
        log_cdp_result("post-ok", args=cdp_args, code=code, output=output, extra=f"feedId={feed_id}")
    else:
        safe_print(f"[post] failed feedId={feed_id}")
        log_cdp_result("post-fail", args=cdp_args, code=code, output=output, extra=f"feedId={feed_id}")
    return ok, detail, upvote_ok


def upvote_feed(feed_id: str, xsec_token: str) -> tuple[bool, str]:
    """备用：单独点赞（优先用 post_comment 的 --also-upvote）。"""
    cdp_args = [
        "--reuse-existing-tab",
        "note-upvote",
        "--feed-id",
        feed_id,
        "--xsec-token",
        xsec_token,
    ]
    safe_print(f"[upvote] attempt feedId={feed_id}")
    code, output = run_cdp(cdp_args, timeout=90)
    result = extract_json_block(output, "NOTE_UPVOTE_RESULT:")
    ok = (
        code == 0
        and bool(result)
        and bool(result.get("success"))
        and bool(result.get("state_after"))
    )
    detail = output[-800:] if output else ""
    if ok:
        safe_print(f"[upvote] success feedId={feed_id}")
    else:
        safe_print(f"[upvote] failed feedId={feed_id}")
        log_cdp_result("upvote-fail", args=cdp_args, code=code, output=output, extra=f"feedId={feed_id}")
    return ok, detail


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=10, help="成功触达帖数（本次运行，不含楼中楼条数）")
    parser.add_argument("--count", type=int, default=None, help="同 --target，优先使用")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-age-days", type=int, default=60)
    parser.add_argument("--min-relevance", type=int, default=2)
    parser.add_argument("--max-per-hour", type=int, default=None, help="覆盖 rateLimits.maxPerHour（0=不限）")
    parser.add_argument("--max-per-day", type=int, default=None, help="覆盖 rateLimits.maxPerDay（帖/天）")
    parser.add_argument("--ignore-circuit-breaker", action="store_true", help="忽略熔断（仅调试）")
    parser.add_argument(
        "--search-scrolls",
        type=int,
        default=DEFAULT_SEARCH_SCROLLS,
        help=f"单次搜索最多增量滚动次数 (0-8，默认 {DEFAULT_SEARCH_SCROLLS})；首屏有可用帖则不再滚动",
    )
    args = parser.parse_args()
    run_target = args.count if args.count is not None else args.target
    search_scrolls = max(0, min(8, int(args.search_scrolls)))
    search_tasks = build_search_tasks()
    init_run_log()

    with campaign_instance_lock():
        return _run_campaign(args, run_target, search_scrolls, search_tasks)


def _run_campaign(
    args: argparse.Namespace,
    run_target: int,
    search_scrolls: int,
    search_tasks: list[dict[str, str]],
) -> int:
    if not REDBOOK_DIR.exists():
        safe_print(f"RedBookSkills not found: {REDBOOK_DIR}")
        return 1

    messages_cfg = load_json(MESSAGES_PATH)
    records = load_records()
    rate_limits = load_rate_limits(messages_cfg)
    if args.max_per_hour is not None:
        rate_limits["maxPerHour"] = args.max_per_hour
    if args.max_per_day is not None:
        rate_limits["maxPerDay"] = args.max_per_day

    now = datetime.now(TZ)

    if not args.ignore_circuit_breaker and not args.dry_run:
        ok_cb, cb_msg = check_circuit_breaker(records, now)
        if not ok_cb:
            safe_print(f"[circuit-breaker] {cb_msg}")
            return 3

    if not args.dry_run:
        ok_rl, rl_msg = check_rate_limits(records, rate_limits, now)
        hour_ago = now - timedelta(hours=1)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        safe_print(
            f"[rate-status] hourly={count_recent_posts(records, hour_ago)}/"
            f"{rate_limits['maxPerHour'] if int(rate_limits['maxPerHour']) > 0 else 'off'} "
            f"daily={count_recent_posts(records, day_start)}/{rate_limits['maxPerDay']} ok={ok_rl} {rl_msg}"
        )
        if not wait_for_rate_limits(records, rate_limits):
            return 4

    started = time.time()
    used_message_ids: set[int] = set()
    success = 0
    failures: list[str] = []
    unique_posts = len(
        {
            str(item.get("feedId") or "")
            for item in records.get("records") or []
            if item.get("commentType") != "dry-run" and item.get("feedId")
        }
    )
    safe_print(
        f"[start] target={run_target} dry_run={args.dry_run} "
        f"max_age_days={args.max_age_days} min_relevance={args.min_relevance} "
        f"history_posts={unique_posts} dedup_skip={len(records.get('commentedPosts') or [])} "
        f"liked_skip={len(records.get('likedPosts') or [])} "
        f"search_tasks={len(search_tasks)} search_scrolls={search_scrolls}"
    )

    safe_print("[step] check-login")
    clear_cdp_lock()
    login_args = ["check-login"]
    code, output = run_cdp(login_args, timeout=90)
    if code != 0 or "Login confirmed" not in output and "login confirmed" not in output.lower():
        clear_cdp_lock()
        safe_print("[step] check-login retry after 2s")
        time.sleep(2)
        code, output = run_cdp(login_args, timeout=90)
    if code != 0 or "Login confirmed" not in output and "login confirmed" not in output.lower():
        log_cdp_result("check-login-fail", args=login_args, code=code, output=output)
        safe_print("[error] not logged in")
        return 1
    log_cdp_result("check-login-ok", args=login_args, code=code, output=output)

    hour_cap = rate_limits["maxPerHour"]
    hour_cap_text = "off" if int(hour_cap) <= 0 else str(hour_cap)
    safe_print(
        f"[limits] interval={format_comment_interval(rate_limits)} "
        f"posts/hour={hour_cap_text} posts/day={rate_limits['maxPerDay']} "
        f"circuit={rate_limits['circuitBreakerHours']}h"
    )

    processed_this_run: set[str] = set()
    seen_feed_ids: set[str] = set()
    task_index = 0
    empty_search_streak = 0
    search_count = 0
    stop_campaign = False

    while success < run_target and not stop_campaign:
        if empty_search_streak >= len(search_tasks):
            safe_print(
                f"[info] all search tasks tried with no new candidates, stop "
                f"(search_count={search_count} empty_streak={empty_search_streak})"
            )
            break

        task = search_tasks[task_index % len(search_tasks)]
        task_index += 1
        keyword = task["keyword"]
        sort_by = task.get("sort_by") or None
        publish_time = task.get("publish_time") or None
        safe_print(
            f"[search-next] keyword={keyword} sort={sort_by or '-'} "
            f"task={task_index}/{len(search_tasks)} "
            f"empty_streak={empty_search_streak} seen_feeds={len(seen_feed_ids)}"
        )

        if search_count > 0:
            wait_s = random_search_wait_seconds(rate_limits)
            safe_print(f"[search-wait] {wait_s:.0f}s before keyword={keyword} sort={sort_by or '-'}")
            time.sleep(wait_s)

        now = datetime.now(TZ)
        records = load_records()
        found, raw_count, skipped, search_rate_limited, captcha_blocked = search_one_keyword(
            keyword,
            records,
            seen_feed_ids=seen_feed_ids,
            max_age_days=args.max_age_days,
            min_relevance=args.min_relevance,
            now=now,
            sort_by=sort_by,
            publish_time=publish_time,
            search_scrolls=search_scrolls,
            detail_wait_limits=rate_limits,
        )
        search_count += 1

        if captcha_blocked:
            safe_print("[stop] captcha detected during search, manual verify required")
            stop_campaign = True
            break

        if search_rate_limited:
            safe_print("[stop] platform rate limit detected during search")
            stop_campaign = True
            break

        if not found:
            safe_print(
                f"[search] keyword={keyword} sort={sort_by or '-'} raw={raw_count} skipped={skipped} "
                f"hit=0 rate_limited={search_rate_limited}"
            )
            empty_search_streak += 1
            continue

        candidate = found[0]
        if candidate["feedId"] in processed_this_run:
            empty_search_streak += 1
            continue

        empty_search_streak = 0
        safe_print(
            f"[search-hit] keyword={keyword} sort={sort_by or '-'} raw={raw_count} skipped={skipped} "
            f"feedId={candidate['feedId']} score={candidate['relevanceScore']} "
            f"title={candidate['title'][:32]} → post now"
        )

        if not args.dry_run:
            if not wait_for_rate_limits(records, rate_limits):
                safe_print("[rate-limit] stop: daily cap reached")
                stop_campaign = True
                break

        feed_id = candidate["feedId"]
        records = load_records()
        skip, skip_reason = should_skip_feed(records, feed_id, candidate["authorId"])
        if skip:
            safe_print(
                f"[skip-{skip_reason}] feedId={feed_id} already touched before post "
                f"(disk reload)"
            )
            processed_this_run.add(feed_id)
            continue

        post_context = build_post_context(candidate)
        msg, match_score = pick_message_for_context(post_context, messages_cfg, used_message_ids)
        used_message_ids.add(int(msg["id"]))
        content = str(msg["text"])
        msg_category = str(msg.get("category") or "")

        safe_print(
            f"[plan] #{success + 1} keyword={candidate['keyword']} "
            f"title={candidate['title'][:36]} comments={candidate['commentCount']} "
            f"age={candidate['ageDays']}d score={candidate['relevanceScore']} "
            f"msg={msg['id']}/{msg_category} match={match_score}"
        )

        if args.dry_run:
            success += 1
            processed_this_run.add(feed_id)
            append_record(
                records,
                feed_id=feed_id,
                feed_title=candidate["title"],
                author_id=candidate["authorId"],
                author_nickname=candidate["authorNickname"],
                keyword=candidate["keyword"],
                message_id=int(msg["id"]),
                message_text=content,
                comment_type="dry-run",
                comment_count=candidate["commentCount"],
                message_category=msg_category,
                match_score=match_score,
            )
            continue

        ok, detail, upvote_ok = post_comment(feed_id, candidate["xsecToken"], content)
        if ok:
            saved, records = commit_comment_record(
                feed_id=feed_id,
                feed_title=candidate["title"],
                author_id=candidate["authorId"],
                author_nickname=candidate["authorNickname"],
                keyword=candidate["keyword"],
                message_id=int(msg["id"]),
                message_text=content,
                comment_type="top-level",
                comment_count=candidate["commentCount"],
                message_category=msg_category,
                match_score=match_score,
                upvote_confirmed=upvote_ok,
            )
            if saved:
                success += 1
                processed_this_run.add(feed_id)
                safe_print(f"[ok] post done ({success}/{run_target})")
            else:
                safe_print(f"[skip-dup] feedId={feed_id} post ok but already recorded elsewhere")
                processed_this_run.add(feed_id)
        else:
            processed_this_run.add(feed_id)
            failures.append(f"{feed_id}: {detail[-200:]}")
            safe_print(f"[fail] feedId={feed_id} detail_tail={detail[-300:]}")
            if is_captcha_challenge(detail):
                safe_print("[stop] captcha detected during post, manual verify required")
                stop_campaign = True
                break
            if is_platform_rate_limited(detail):
                safe_print("[stop] platform rate limit detected during post")
                stop_campaign = True
                break
            if is_infrastructure_failure(detail):
                clear_cdp_lock()
                safe_print("[retry-infra] CDP lock cleared, retry once after 30s")
                time.sleep(30)
                records = load_records()
                if is_seen(records, feed_id, candidate["authorId"]):
                    safe_print(f"[skip-dup] feedId={feed_id} already commented before retry")
                    processed_this_run.add(feed_id)
                    continue
                ok, detail, upvote_ok = post_comment(feed_id, candidate["xsecToken"], content)
                if ok:
                    saved, records = commit_comment_record(
                        feed_id=feed_id,
                        feed_title=candidate["title"],
                        author_id=candidate["authorId"],
                        author_nickname=candidate["authorNickname"],
                        keyword=candidate["keyword"],
                        message_id=int(msg["id"]),
                        message_text=content,
                        comment_type="top-level",
                        comment_count=candidate["commentCount"],
                        message_category=msg_category,
                        match_score=match_score,
                        upvote_confirmed=upvote_ok,
                    )
                    if saved:
                        success += 1
                        processed_this_run.add(feed_id)
                        safe_print(f"[ok] post done after retry ({success}/{run_target})")
                    else:
                        safe_print(f"[skip-dup] feedId={feed_id} retry ok but already recorded")
                        processed_this_run.add(feed_id)
                    if success < run_target:
                        wait_s = random_comment_wait_seconds(rate_limits)
                        safe_print(
                            f"[wait] {wait_s}s (~{wait_s / 60:.1f}min, "
                            f"random {format_comment_interval(rate_limits)})"
                        )
                        time.sleep(wait_s)
                    continue
            safe_print(f"[skip-fail] post_comment failed on {feed_id}, continue next candidate")
            continue

        if success < run_target and not args.dry_run:
            wait_s = random_comment_wait_seconds(rate_limits)
            safe_print(
                f"[wait] {wait_s}s (~{wait_s / 60:.1f}min, "
                f"random {format_comment_interval(rate_limits)})"
            )
            time.sleep(wait_s)

    elapsed = time.time() - started
    records = load_records()

    summary = {
        "target": run_target,
        "success": success,
        "searchCount": search_count,
        "failures": len(failures),
        "logFile": str(RUN_LOG_PATH) if RUN_LOG_PATH else None,
        "elapsedSeconds": round(elapsed, 1),
        "elapsedMinutes": round(elapsed / 60, 2),
        "dryRun": args.dry_run,
        "rateLimits": rate_limits,
        "circuitBreakerUntil": records.get("circuitBreakerUntil"),
        "finishedAt": datetime.now(TZ).isoformat(timespec="seconds"),
    }
    safe_print("\n=== SUMMARY ===")
    safe_print(json.dumps(summary, ensure_ascii=False, indent=2))
    if failures:
        safe_print("failures:")
        for item in failures[:5]:
            safe_print(item)
    if failures and not args.dry_run:
        return 3
    return 0 if success >= run_target else 2


if __name__ == "__main__":
    raise SystemExit(main())
