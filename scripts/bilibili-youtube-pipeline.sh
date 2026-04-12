#!/bin/bash
#===========================================================
# B站街头美食 → YouTube 全自动流水线 v2.0
# 作者：海鲜帝国团队
# 用途：B站视频下载 → 分段 → BGM混音 → 字幕 → YouTube上传
#===========================================================

set -e
WORKDIR="${HOME}/冻品视频素材"
RAWDIR="$WORKDIR/街头美食原片"
SEGDIR="$WORKDIR/分段"
OUTDIR="$WORKDIR/输出/街头美食"
SUBTITLE_DIR="$WORKDIR/字幕"
BGMDIR="$WORKDIR/BGM"
CREDENTIALS="${HOME}/.config/google-oauth/credentials.json"
COOKIES="${HOME}/.config/youtube-upload/cookies.txt"

#------------------------------
# 颜色输出
#------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

#------------------------------
# 依赖检查
#------------------------------
check_deps() {
  log "检查依赖..."
  for cmd in yt-dlp ffmpeg python3; do
    which $cmd > /dev/null || err "$cmd 未安装"
  done
  python3 -c "import whisper" 2>/dev/null || err "Whisper未安装: pip install openai-whisper"
  log "依赖检查 ✅"
}

#------------------------------
# 第1步：下载B站视频
#------------------------------
download_bilibili() {
  local URL="$1"
  local OUTPUT="$RAWDIR/$(echo "$URL" | grep -oP 'BV[^/?]+')"
  
  if ls "$RAWDIR"/*.mp4 2>/dev/null | grep -q "$(basename $OUTPUT)"; then
    warn "视频已存在，跳过下载: $OUTPUT"
    return
  fi
  
  log "下载B站视频: $URL"
  yt-dlp "$URL" \
    -f "30064+bestaudio" \
    --merge-output-format mp4 \
    -o "$RAWDIR/%(title)s_%(id)s.%(ext)s" \
    --write-auto-sub --sub-lang zh-Hans \
    || err "下载失败"
  log "下载完成 ✅"
}

#------------------------------
# 第2步：视频分段（10分钟/段）
#------------------------------
segment_video() {
  local VIDEO="$1"
  local BASENAME=$(basename "$VIDEO" .mp4)
  
  mkdir -p "$SEGDIR"
  log "分段视频: $BASENAME (10分钟/段)"
  
  ffmpeg -i "$VIDEO" -c copy \
    -segment_time 600 \
    -f segment \
    -reset_timestamps 1 \
    "$SEGDIR/${BASENAME}_%03d.mp4" \
    2>/dev/null | grep -E "(error|Error)" || true
  
  local count=$(ls "$SEGDIR"/${BASENAME}_*.mp4 2>/dev/null | wc -l | tr -d ' ')
  log "分段完成: ${count} 个片段"
}

#------------------------------
# 第3步：Whisper字幕生成
#------------------------------
generate_subtitles() {
  local SEGMENT="$1"
  local BASENAME=$(basename "$SEGMENT" .mp4)
  local SRT="$SUBTITLE_DIR/${BASENAME}.srt"
  
  mkdir -p "$SUBTITLE_DIR"
  log "生成字幕: $BASENAME"
  
  python3 << EOF
import whisper
model = whisper.load_model("base")
result = model.transcribe("$SEGMENT", language="zh", task="transcribe")
with open("$SRT", "w", encoding="utf-8") as f:
    for i, segment in enumerate(result["segments"]):
        start = segment["start"]
        end = segment["end"]
        text = segment["text"].strip()
        sh, sm, ss = int(start//3600), int((start%3600)//60), int(start%60)
        sms = int((start%1)*1000)
        eh, em, es = int(end//3600), int((end%3600)//60), int(end%60)
        ems = int((end%1)*1000)
        f.write(f"{i+1}\n")
        f.write(f"{sh:02d}:{sm:02d}:{ss:02d},{sms:03d} --> {eh:02d}:{em:02d}:{es:02d},{ems:03d}\n")
        f.write(f"{text}\n\n")
EOF
  log "字幕完成: $SRT"
}

#------------------------------
# 第4步：字幕烧录进视频
#------------------------------
burn_subtitles() {
  local SEGMENT="$1"
  local BASENAME=$(basename "$SEGMENT" .mp4)
  local SRT="$SUBTITLE_DIR/${BASENAME}.srt"
  local OUTPUT="$OUTDIR/${BASENAME}_sub.mp4"
  
  mkdir -p "$OUTDIR"
  
  if [ ! -f "$SRT" ]; then
    warn "字幕不存在，跳过: $SRT"
    return
  fi
  
  log "烧录字幕: $BASENAME"
  ffmpeg -i "$SEGMENT" -vf "subtitles='$SRT':force_style='FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2'" \
    -c:a copy \
    "$OUTPUT" -y 2>/dev/null | grep -E "error" || true
  
  log "输出: $OUTPUT"
}

#------------------------------
# 第5步：YouTube上传
#------------------------------
upload_youtube() {
  local VIDEO="$1"
  local TITLE="$2"
  local DESCRIPTION="${3:-中国街头美食 - 烟火气十足的地道小吃}"
  
  log "上传YouTube: $TITLE"
  
  # 使用Python Google API上传
  python3 << PYEOF
import os, google_auth_oauthlib, googleapiclient.discovery, googleapiclient.errors

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
CLIENT_SECRETS = os.environ.get("CREDENTIALS", "${CREDENTIALS}")
API_SERVICE_NAME = "youtube"
API_VERSION = "v3"

def get_authenticated_service():
    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRETS, SCOPES)
    credentials = flow.run_local_server(port=0)
    return googleapiclient.discovery.build(API_SERVICE_NAME, API_VERSION, credentials=credentials)

def upload_video(youtube, filename, title, description):
    request = youtube.videos().insert(
        part="snippet,status",
        body={
            "snippet": {
                "title": title,
                "description": description,
                "tags": ["街头美食", "中国美食", "夜市", "小吃"],
                "categoryId": "22"
            },
            "status": {
                "privacyStatus": "public",
                "selfDeclaredMadeForKids": False
            }
        },
        media_body=googleapiclient.http.MediaFileUpload(filename)
    )
    response = request.execute()
    print(f"上传成功! Video ID: {response['id']}")
    return response['id']

youtube = get_authenticated_service()
video_id = upload_video(youtube, "$VIDEO", "$TITLE", "$DESCRIPTION")
print(f"https://www.youtube.com/watch?v={video_id}")
PYEOF
}

#------------------------------
# 主流程
#------------------------------
main() {
  log "========== B站→YouTube 流水线 启动 =========="
  check_deps
  
  local VIDEO="$1"
  local PLAYLIST_URL="${2:-}"
  local TITLE_PREFIX="${3:-中国街头美食}"
  
  if [ -z "$VIDEO" ]; then
    echo "用法: $0 <B站URL> [标题前缀]"
    echo "示例: $0 https://www.bilibili.com/video/BV1anADzQEpp/ 重庆早市"
    exit 1
  fi
  
  # 下载
  download_bilibili "$VIDEO"
  
  # 找到下载的视频
  local downloaded=$(ls -t "$RAWDIR"/*.mp4 2>/dev/null | head -1)
  [ -z "$downloaded" ] && err "未找到下载的视频"
  
  # 分段
  segment_video "$downloaded"
  
  # 获取所有片段
  local segments=$(ls -v "$SEGDIR"/$(basename $downloaded .mp4)_*.mp4 2>/dev/null)
  [ -z "$segments" ] && err "未找到分段文件"
  
  # 处理每个片段
  local i=1
  for seg in $segments; do
    local basename=$(basename "$seg" .mp4)
    local seg_title="$TITLE_PREFIX 第${i}段"
    
    log "处理片段 $i: $seg"
    
    # 生成字幕
    generate_subtitles "$seg"
    
    # 烧录字幕
    burn_subtitles "$seg"
    
    # 上传YouTube
    local final="$OUTDIR/${basename}_sub.mp4"
    if [ -f "$final" ]; then
      upload_youtube "$final" "$seg_title"
    else
      warn "跳过上传（文件不存在）: $final"
    fi
    
    i=$((i+1))
  done
  
  log "========== 流水线完成 =========="
}

# 运行
main "$@"
