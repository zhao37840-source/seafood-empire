# 海鲜帝国工具脚本 v1.0

> Agent 可调用的可执行工具

## 📁 目录结构

```
scripts/
├── ecommerce/
│   ├── price-quote.sh      报价单生成
│   └── order-manager.sh    订单管理
├── analytics/
│   └── data-report.sh      数据报表
└── video/
    └── video-upload.sh     视频分发
```

## 🚀 快速开始

### 1. 报价单生成

```bash
./scripts/ecommerce/price-quote.sh \
  --product "乳山" --spec "L" --quantity 10 --client "张三"
```

输出:
```json
{
  "product": "乳山",
  "spec": "L",
  "quantity": 10,
  "unit_price": 185,
  "discount": 2,
  "final_price": 183,
  "total": 1830,
  "client": "张三",
  "date": "2026-04-10"
}
```

### 2. 订单管理

```bash
# 查看订单
./scripts/ecommerce/order-manager.sh list

# 添加订单
./scripts/ecommerce/order-manager.sh add \
  --product "乳山L" --qty 10 --client "张三" --phone "138xxx"

# 更新状态
./scripts/ecommerce/order-manager.sh update \
  --order-id "ORDER20260410143022" --status "completed"
```

### 3. 数据报表

```bash
# 今日数据
./scripts/analytics/data-report.sh daily

# 周报
./scripts/analytics/data-report.sh weekly

# 自定义天数
./scripts/analytics/data-report.sh summary --days 30
```

### 4. 视频分发

```bash
# YouTube
./scripts/video/video-upload.sh youtube \
  --file /path/to/video.mp4 \
  --title "生蚝批发" \
  --desc "正宗乳山生蚝，批发价"

# 抖音（生成上传信息）
./scripts/video/video-upload.sh douyin \
  --file /path/to/video.mp4 \
  --title "生蚝批发"
```

## 📊 价格表

| 产品 | 规格 | 价格(元/件) |
|------|------|-------------|
| 乳山 | L | 185 |
| 乳山 | M | 165 |
| 乳山 | S | 145 |
| 湛江 | L | 175 |
| 湛江 | M | 155 |
| 湛江 | S | 135 |

## ⚙️ 配置

数据存储在: `~/金源冻品数据/`

```
~/金源冻品数据/
├── orders.json    订单数据
└── ...
```

## 🔧 Agent 调用方式

Agent 通过 exec 调用:

```
Bash(./seafood-empire-modules/scripts/ecommerce/price-quote.sh --product "乳山" --spec "L" --quantity 10)
```

## 📝 开发日志

- 2026-04-10: v1.0 基础版本，包含报价/订单/报表/分发工具
