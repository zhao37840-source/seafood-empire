#!/bin/bash
# 视频分发工具
# 用法:
#   ./video-upload.sh youtube --file /path/to/video.mp4 --title "标题" --desc "描述"
#   ./video-upload.sh douyin --file /path/to/video.mp4 --title "标题"
# 注意: 抖音/小红书需要手动上传，此工具提供格式化信息辅助

set -e

PLATFORM="${1:-youtube}"
FILE=""
TITLE=""
DESC=""
TAGS="生蚝,烧烤,冻品,海鲜批发"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --desc) DESC="$2"; shift 2 ;;
    --tags) TAGS="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ -z "$FILE" ]]; then
  echo "错误: 必须指定 --file 参数"
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "错误: 文件不存在: $FILE"
  exit 1
fi

# 获取文件信息
FILESIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null || echo "unknown")
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FILE" 2>/dev/null | cut -d. -f1 || echo "unknown")
WIDTH=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$FILE" 2>/dev/null || echo "unknown")
HEIGHT=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$FILE" 2>/dev/null || echo "unknown")

case "$PLATFORM" in
  youtube)
    echo "=== YouTube 上传信息 ==="
    echo "文件: $FILE"
    echo "大小: $((FILESIZE / 1024 / 1024)) MB"
    echo "时长: ${DURATION}s"
    echo "分辨率: ${WIDTH}x${HEIGHT}"
    echo ""
    echo "标题: ${TITLE:-无标题}"
    echo "描述: ${DESC:-无描述}"
    echo "标签: $TAGS"
    echo ""
    
    read -p "确认上传YouTube? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo "正在调用 YouTube upload..."
      # 这里调用之前配置好的 youtube-upload
      python3 -c "
import subprocess
import os
print('YouTube upload 调用-placeholder')
print('实际上传需要配置 OAuth credentials')
" 
    else
      echo "已取消"
    fi
    ;;
  douyin)
    echo "=== 抖音分发准备 ==="
    echo "文件: $FILE"
    echo "标题: ${TITLE:-无标题}"
    echo ""
    echo "注意: 抖音需要手动上传"
    echo "建议标题: ${TITLE:-生蚝批发}" 
    echo "建议话题: #生蚝 #烧烤 #冻品 #海鲜批发"
    echo ""
    echo "生成封面建议: ffmpeg -i '$FILE' -ss 00:00:03 -vframes 1 thumbnail.jpg"
    ;;
  xiaohongshu)
    echo "=== 小红书分发准备 ==="
    echo "文件: $FILE"
    echo "标题: ${TITLE:-无标题}"
    echo "描述: ${DESC:-无描述}"
    echo ""
    echo "注意: 小红书需要手动上传"
    ;;
  *)
    echo "支持平台: youtube, douyin, xiaohongshu"
    ;;
esac
