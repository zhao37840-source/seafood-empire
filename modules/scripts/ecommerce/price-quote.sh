#!/bin/bash
# 报价单生成工具
# 用法: ./price-quote.sh --product "乳山生蚝" --spec "L规格" --quantity 10

set -e

PRODUCT=""
SPEC=""
QUANTITY=1
CLIENT=""
DISCOUNT=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --product) PRODUCT="$2"; shift 2 ;;
    --spec) SPEC="$2"; shift 2 ;;
    --quantity) QUANTITY="$2"; shift 2 ;;
    --client) CLIENT="$2"; shift 2 ;;
    --discount) DISCOUNT="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# 价格表（单位：元/件）- 用case代替declare -A兼容macOS bash 3.x
case "${PRODUCT}${SPEC}" in
  乳山L) BASE_PRICE=185 ;;
  乳山M) BASE_PRICE=165 ;;
  乳山S) BASE_PRICE=145 ;;
  湛江L) BASE_PRICE=175 ;;
  湛江M) BASE_PRICE=155 ;;
  湛江S) BASE_PRICE=135 ;;
  *) BASE_PRICE=0 ;;
esac

if [[ $BASE_PRICE -eq 0 ]]; then
  echo "{\"error\": \"未找到产品: ${PRODUCT}${SPEC}\", \"available\": [\"乳山L\", \"乳山M\", \"乳山S\", \"湛江L\", \"湛江M\", \"湛江S\"]}"
  exit 1
fi

# 折扣计算
if [[ $QUANTITY -ge 50 ]]; then
  DISCOUNT=10
elif [[ $QUANTITY -ge 20 ]]; then
  DISCOUNT=5
elif [[ $QUANTITY -ge 10 ]]; then
  DISCOUNT=2
fi

FINAL_PRICE=$((BASE_PRICE - DISCOUNT))
TOTAL=$((FINAL_PRICE * QUANTITY))

# 输出JSON
cat << EOF
{
  "product": "${PRODUCT}",
  "spec": "${SPEC}",
  "quantity": ${QUANTITY},
  "unit_price": ${BASE_PRICE},
  "discount": ${DISCOUNT},
  "final_price": ${FINAL_PRICE},
  "total": ${TOTAL},
  "client": "${CLIENT:-新客户}",
  "date": "$(date +%Y-%m-%d)",
  "valid_until": "$(date -v+3d +%Y-%m-%d)"
}
EOF
