#!/bin/bash
# 订单管理工具
# 用法: 
#   ./order-manager.sh list
#   ./order-manager.sh add --product "乳山L" --qty 10 --client "张三" --phone "138xxx"
#   ./order-manager.sh status --order-id ORDER20260410001

ORDERS_FILE="$HOME/金源冻品数据/orders.json"
mkdir -p "$(dirname "$ORDERS_FILE")"

[[ ! -f "$ORDERS_FILE" ]] && echo "[]" > "$ORDERS_FILE"

CMD="${1:-list}"

case "$CMD" in
  list)
    echo "=== 订单列表 ===" 
    cat "$ORDERS_FILE" | python3 -m json.tool 2>/dev/null || cat "$ORDERS_FILE"
    ;;
  add)
    shift
    PRODUCT="" QTY="" CLIENT="" PHONE="" NOTE=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --product) PRODUCT="$2"; shift 2 ;;
        --qty) QTY="$2"; shift 2 ;;
        --client) CLIENT="$2"; shift 2 ;;
        --phone) PHONE="$2"; shift 2 ;;
        --note) NOTE="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    
    ORDER_ID="ORDER$(date +%Y%m%d%H%M%S)"
    TIMESTAMP="$(date -Iseconds)"
    
    NEW_ORDER=$(cat << EOF
{
  "id": "${ORDER_ID}",
  "product": "${PRODUCT}",
  "quantity": ${QTY},
  "client": "${CLIENT}",
  "phone": "${PHONE}",
  "note": "${NOTE}",
  "status": "pending",
  "created_at": "${TIMESTAMP}"
}
EOF
)
    
    # 添加到JSON数组
    python3 << EOF
import json

with open('$ORDERS_FILE', 'r') as f:
    orders = json.load(f)

orders.append(json.loads('''${NEW_ORDER}'''))

with open('$ORDERS_FILE', 'w') as f:
    json.dump(orders, f, indent=2, ensure_ascii=False)

print('订单已创建: ${ORDER_ID}')
EOF
    ;;
  status)
    shift
    ORDER_ID=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --order-id) ORDER_ID="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    python3 << EOF
import json

with open('$ORDERS_FILE', 'r') as f:
    orders = json.load(f)

for order in orders:
    if order['id'] == '$ORDER_ID':
        print(json.dumps(order, indent=2, ensure_ascii=False))
        break
else:
    print('未找到订单: $ORDER_ID')
EOF
    ;;
  update)
    shift
    ORDER_ID="" STATUS=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --order-id) ORDER_ID="$2"; shift 2 ;;
        --status) STATUS="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    python3 << EOF
import json

with open('$ORDERS_FILE', 'r') as f:
    orders = json.load(f)

for order in orders:
    if order['id'] == '$ORDER_ID':
        order['status'] = '$STATUS'
        order['updated_at'] = '$(date -Iseconds)'
        print('已更新: ${ORDER_ID} -> ${STATUS}')
        break
else:
    print('未找到订单: $ORDER_ID')

with open('$ORDERS_FILE', 'w') as f:
    json.dump(orders, f, indent=2, ensure_ascii=False)
EOF
    ;;
  *)
    echo "用法: order-manager.sh [list|add|status|update]"
    ;;
esac
