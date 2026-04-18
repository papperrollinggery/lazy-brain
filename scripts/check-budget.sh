#!/bin/bash
# 定期检查 sssaicode 余额，超过阈值飞书告警
# 用法: ./scripts/check-budget.sh
# 配 launchd/cron: 每小时跑一次

THRESHOLD_LOW=50      # 低于此值告警
THRESHOLD_CRIT=20     # 低于此值严重告警
FEISHU_CHAT="oc_867b7acb1ef1064bbf01c3dc2d20dc58"

TEXT=$(osascript <<'EOF'
tell application "Google Chrome"
  set found to false
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "sssaicode" then
        set URL of t to "https://sssaicode.com/subscription"
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
end tell
delay 4
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "subscription" then
        return execute t javascript "document.body.innerText"
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell
EOF
)

if [[ "$TEXT" == "NO_TAB" ]]; then
  echo "[ERR] sssaicode tab not open in Chrome"
  exit 1
fi

# 提取所有 "余额\n$xxx" 段落，正余额求和
TOTAL=$(echo "$TEXT" | awk '
  /^余额$/ { getline next_line; gsub(/[$,]/,"",next_line);
    if (next_line ~ /^[0-9.]+$/ && next_line+0 > 0) sum += next_line }
  END { printf "%.2f", sum }
')

DAILY=$(echo "$TEXT" | grep -A1 "当日使用" | tail -1 | tr -d '$,')

echo "[$(date '+%F %T')] 剩余 \$$TOTAL | 今日已用 \$${DAILY:-?}"

# 阈值告警
ALERT=""
if (( $(echo "$TOTAL < $THRESHOLD_CRIT" | bc -l) )); then
  ALERT="🚨【预算危急】剩余 \$$TOTAL < \$$THRESHOLD_CRIT，Manager 立刻停止所有派单"
elif (( $(echo "$TOTAL < $THRESHOLD_LOW" | bc -l) )); then
  ALERT="💰【预算告警】剩余 \$$TOTAL < \$$THRESHOLD_LOW，进入极简模式"
fi

if [[ -n "$ALERT" ]]; then
  hermes chat -q "用 send_message 工具，平台 feishu，目标 $FEISHU_CHAT，内容：'$ALERT'" 2>&1 | tail -3
fi
