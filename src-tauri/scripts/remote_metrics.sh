#!/bin/sh
# Emits one JSON line with server stats (Linux /proc).
read -r cpu u n s idle rest < /proc/stat || exit 1
s1=$((u + n + s + idle))
i1=$idle
sleep 1
read -r cpu u n s idle rest < /proc/stat || exit 1
s2=$((u + n + s + idle))
i2=$idle
dt=$((s2 - s1))
di=$((i2 - i1))
cpu=0
if [ "$dt" -gt 0 ]; then
  cpu=$(((dt - di) * 100 / dt))
fi

mt=$(awk '/MemTotal/{print $2}' /proc/meminfo)
ma=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
if [ -z "$ma" ]; then
  mf=$(awk '/MemFree/{print $2}' /proc/meminfo)
  bu=$(awk '/Buffers/{print $2}' /proc/meminfo)
  ca=$(awk '/^Cached:/{print $2}' /proc/meminfo)
  ma=$((mf + bu + ca))
fi
mu=$((mt - ma))

du=0
dtb=0
dp=0
df_line=$(df -P / 2>/dev/null | tail -1)
if [ -n "$df_line" ]; then
  du=$(echo "$df_line" | awk '{print $3}')
  dtb=$(echo "$df_line" | awk '{print $2}')
  dp=$(echo "$df_line" | awk '{gsub(/%/,""); print $5}')
fi

l1=$(cut -d' ' -f1 /proc/loadavg)
ncpu=$(nproc 2>/dev/null || echo 1)

printf '{"cpuPct":%s,"memUsedKb":%s,"memTotalKb":%s,"diskUsedKb":%s,"diskTotalKb":%s,"diskPct":%s,"load1":%s,"cpus":%s}\n' \
  "$cpu" "$mu" "$mt" "$du" "$dtb" "$dp" "$l1" "$ncpu"
