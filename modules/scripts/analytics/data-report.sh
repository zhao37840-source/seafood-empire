#!/bin/bash
# 数据报表生成工具
# 用法:
#   ./data-report.sh daily
#   ./data-report.sh weekly
#   ./data-report.sh summary --days 7

ORDERS_FILE="$HOME/金源冻品数据/orders.json"
mkdir -p "$(dirname "$ORDERS_FILE")"

[[ ! -f "$ORDERS_FILE" ]] && echo "[]" > "$ORDERS_FILE"

CMD="${1:-daily}"

case "$CMD" in
  daily)
    python3 << 'EOF'
import json
from datetime import datetime, timedelta

with open('/Users/zhaoshuting/金源冻品数据/orders.json', 'r') as f:
    orders = json.load(f)

today = datetime.now().strftime('%Y-%m-%d')
today_orders = [o for o in orders if o.get('created_at', '').startswith(today)]

total = len(today_orders)
pending = len([o for o in today_orders if o.get('status') == 'pending'])
completed = len([o for o in today_orders if o.get('status') == 'completed'])

print(f"=== 今日数据 ({today}) ===")
print(f"总订单: {total}")
print(f"待处理: {pending}")
print(f"已完成: {completed}")

# 产品销量统计
products = {}
for o in today_orders:
    p = o.get('product', '未知')
    products[p] = products.get(p, 0) + o.get('quantity', 0)

if products:
    print("\n产品销量:")
    for p, qty in sorted(products.items(), key=lambda x: -x[1]):
        print(f"  {p}: {qty}件")
EOF
    ;;
  weekly)
    python3 << 'EOF'
import json
from datetime import datetime, timedelta

with open('/Users/zhaoshuting/金源冻品数据/orders.json', 'r') as f:
    orders = json.load(f)

week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
week_orders = [o for o in orders if o.get('created_at', '').startswith(week_ago[:10])]

# 实际按周筛选
week_orders = []
for o in orders:
    created = o.get('created_at', '')
    if created:
        date_str = created[:10]
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            if (datetime.now() - date_obj).days <= 7:
                week_orders.append(o)
        except:
            pass

total = len(week_orders)
completed = len([o for o in week_orders if o.get('status') == 'completed'])
total_qty = sum(o.get('quantity', 0) for o in week_orders)

print(f"=== 周报 (近7天) ===")
print(f"总订单: {total}")
print(f"完成数: {completed}")
print(f"总销量: {total_qty}件")

# 按产品统计
products = {}
for o in week_orders:
    p = o.get('product', '未知')
    products[p] = products.get(p, 0) + o.get('quantity', 0)

if products:
    print("\n产品销量排行:")
    for p, qty in sorted(products.items(), key=lambda x: -x[1]):
        print(f"  {p}: {qty}件")

# 客户统计
clients = {}
for o in week_orders:
    c = o.get('client', '未知')
    clients[c] = clients.get(c, 0) + 1

if clients:
    print(f"\n客户数: {len(clients)}")
    top_clients = sorted(clients.items(), key=lambda x: -x[1])[:3]
    print("TOP客户:")
    for c, cnt in top_clients:
        print(f"  {c}: {cnt}单")
EOF
    ;;
  summary)
    DAYS="${2:-7}"
    python3 << EOF
import json
from datetime import datetime, timedelta

with open('/Users/zhaoshuting/金源冻品数据/orders.json', 'r') as f:
    orders = json.load(f)

days = ${DAYS}
cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

recent = []
for o in orders:
    created = o.get('created_at', '')
    if created and created[:10] >= cutoff:
        recent.append(o)

total = len(recent)
completed = len([o for o in recent if o.get('status') == 'completed'])
total_qty = sum(o.get('quantity', 0) for o in recent)

print(f"=== 数据概览 (近{days}天) ===")
print(f"总订单: {total}")
print(f"完成率: {completed/total*100:.1f}%" if total > 0 else "完成率: N/A")
print(f"总销量: {total_qty}件")
EOF
    ;;
  *)
    echo "用法: data-report.sh [daily|weekly|summary]"
    ;;
esac
