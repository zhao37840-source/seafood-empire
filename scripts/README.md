# 脚本目录

## bilibili-youtube-pipeline.sh
B站→YouTube全自动流水线

### 功能
- B站视频下载（720P+，无需cookies）
- ffmpeg自动分段（10分钟/段）
- Whisper字幕生成（中文）
- ffmpeg字幕烧录
- Google API YouTube上传

### 用法
```bash
bash bilibili-youtube-pipeline.sh <B站URL> [标题前缀]
bash bilibili-youtube-pipeline.sh https://www.bilibili.com/video/BV1anADzQEpp/ 重庆早市
```

### 依赖
- yt-dlp
- ffmpeg  
- whisper (openai-whisper)
- google-api-python-client

### 目录结构
- 素材目录: ~/冻品视频素材/街头美食原片/
- 分段目录: ~/冻品视频素材/分段/
- 字幕目录: ~/冻品视频素材/字幕/
- 输出目录: ~/冻品视频素材/输出/街头美食/
- BGM目录: ~/冻品视频素材/BGM/ (需自行放置版权free音乐)

### 已测试素材
- 重庆早市: BV1anADzQEpp (82分钟, 720P, 18.3万播放)
- 新疆喀什街头美食: BV12kCyByEYg (75分钟, 720P)
