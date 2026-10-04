'use strict';
const express = require('express');
const router = express.Router();
const { exec: execCb } = require('child_process');
const requireAuth = require('../../../middleware/requireAuth');

const execAsync = (cmd) => new Promise((res, rej) =>
  execCb(cmd, { timeout: 10000 }, (e, o) => e ? rej(e.message) : res(o.trim()))
);

router.get('/', requireAuth, async (req, res) => {
  const out = {};

  // Worker Status
  out.worker = { running: false, pid: null, uptime: null };
  try {
    const ps = await execAsync("docker exec sw_worker ps aux | grep 'messenger:consume' | grep -v grep");
    if (ps) {
      const parts = ps.trim().split(/\s+/);
      out.worker = { running: true, pid: parts[1], uptime: parts[9] };
    }
  } catch {}

  // Queue Stats
  out.queue = { async: 0, low_priority: 0, failed: 0 };
  try {
    const stats = await execAsync("docker exec sw_php php bin/console messenger:stats --no-ansi 2>/dev/null");
    const lines = stats.split('\n');
    for (const line of lines) {
      const m = line.match(/\|\s+(async|low_priority|failed)\s+\|\s+(\d+)\s+\|/);
      if (m) out.queue[m[1]] = parseInt(m[2]);
    }
  } catch {}

  // Scheduled Tasks overdue
  out.scheduledOverdue = 0;
  try {
    const result = await execAsync(
      `docker exec sw_mysql mysql -ushopware -p'${process.env.SW_DB_PASSWORD || ''}' shopware -sN -e "SELECT COUNT(*) FROM scheduled_task WHERE next_execution_time < NOW() AND status='scheduled';" 2>/dev/null`
    );
    out.scheduledOverdue = parseInt(result) || 0;
  } catch {}

  // Container Stats
  out.containers = {};
  const containerNames = ['sw_php', 'sw_worker', 'sw_mysql', 'sw_redis', 'sw_elasticsearch', 'sw_nginx'];
  try {
    const stats = await execAsync(
      `docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}" ${containerNames.join(' ')} 2>/dev/null`
    );
    for (const line of stats.split('\n').filter(Boolean)) {
      const [name, cpu, mem] = line.split('|');
      out.containers[name] = { cpu: cpu?.replace('%','').trim(), mem: mem?.split('/')[0].trim() };
    }
  } catch {}

  // Redis Info
  out.redis = { usedMemory: '–', hitRate: '–' };
  try {
    const info = await execAsync("docker exec sw_redis redis-cli info stats 2>/dev/null");
    const hits = info.match(/keyspace_hits:(\d+)/)?.[1];
    const misses = info.match(/keyspace_misses:(\d+)/)?.[1];
    const memInfo = await execAsync("docker exec sw_redis redis-cli info memory 2>/dev/null");
    const mem = memInfo.match(/used_memory_human:([^\r\n]+)/)?.[1]?.trim();
    if (hits && misses) {
      const total = parseInt(hits) + parseInt(misses);
      out.redis.hitRate = total > 0 ? Math.round(parseInt(hits) / total * 100) + '%' : '–';
    }
    if (mem) out.redis.usedMemory = mem;
  } catch {}

  res.json({ ok: true, ...out });
});

module.exports = router;
