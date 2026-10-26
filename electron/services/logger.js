'use strict';
/**
 * 运行日志系统：写入 userData/logs/，按天轮转，保留 7 天。
 * 以单例形式对外提供：initLogger(app, isDev) 在 app ready 后初始化，
 * 其它模块通过 getLog() 在调用时取用（初始化前为安全空操作，避免启动期崩溃）。
 */
const path = require('path');
const fs = require('fs');
const { localDate, stamp } = require('./timefmt');

// 调试模式：开启后 ERROR 级日志在消息后追加完整堆栈（含出错文件与行号），用于定位报错代码
let _debug = false;
function setDebug(on) {
  _debug = !!on;
}

// 实时推送订阅：写入端每写一行都通知所有 sink，供 main.js 转 webContents.send 实现运行过程悬浮窗的"流动"输出
const _sinks = new Set();
function onWrite(cb) {
  _sinks.add(cb);
  return () => _sinks.delete(cb);
}

// 初始化前：先缓冲到内存，initLogger 后再刷盘，避免启动早期（initLogger 之前）的报错
// 被安全空操作静默吞掉——例如 initLogger 之前的 uncaughtException、single-instance 回调里的日志。
// 否则出现"启动即崩却毫无日志"的最糟情况，事后无从排查。
let _isDev = false;
let _buffer = [];
function makeBuffered() {
  const self = {
    _buffered: true,
    write(level, msg) {
      _buffer.push({ level, msg });
      if (_isDev) console.log(`[${level}] ${msg}`);
    },
    info(m) {
      self.write('INFO', m);
    },
    warn(m) {
      self.write('WARN', m);
    },
    debug(m) {
      self.write('DEBUG', m);
    },
    error(m, err) {
      let full = m;
      if (err && err.stack) full += '\n' + err.stack;
      self.write('ERROR', full);
    }
  };
  return self;
}
let _log = makeBuffered();

function initLogger(app, isDev) {
  _isDev = !!isDev;
  const _dir = path.join(app.getPath('userData'), 'logs');
  const inst = {
    _stream: null,
    _date: '',
    _dir,
    init() {
      this._dir = path.join(app.getPath('userData'), 'logs');
      try {
        fs.mkdirSync(this._dir, { recursive: true });
      } catch (e) {}
      this._rotate();
      // 清理 7 天前的日志
      try {
        const cutoff = Date.now() - 7 * 86400000;
        for (const f of fs.readdirSync(this._dir)) {
          if (/^app-\d{4}-\d{2}-\d{2}\.log$/.test(f)) {
            const fp = path.join(this._dir, f);
            if (fs.statSync(fp).mtimeMs < cutoff) {
              try {
                fs.unlinkSync(fp);
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    },
    _rotate() {
      const today = localDate();
      if (this._date === today && this._stream) return;
      if (this._stream) {
        try {
          this._stream.end();
        } catch (e) {}
      }
      this._date = today;
      this._stream = fs.createWriteStream(path.join(this._dir, `app-${today}.log`), { flags: 'a' });
    },
    write(level, msg) {
      this._rotate();
      const ts = stamp();
      const line = `[${ts}] [${level}] ${msg}\n`;
      if (this._stream) {
        try {
          this._stream.write(line);
        } catch (e) {}
      }
      // dev 模式同时输出控制台
      if (isDev) console.log(line.trimEnd());
      // 实时推送给订阅者（每次写入都触发，无则跳过）
      if (_sinks.size) {
        for (const s of _sinks) {
          try {
            s({ level, msg, ts });
          } catch (e) {}
        }
      }
    },
    info(msg) {
      this.write('INFO', msg);
    },
    warn(msg) {
      this.write('WARN', msg);
    },
    debug(msg) {
      this.write('DEBUG', msg);
    },
    // 第二参数为 Error 对象；调试模式下在消息后追加完整堆栈（含文件与行号），便于定位报错代码
    error(msg, err) {
      let full = msg;
      if (_debug && err && err.stack) full += '\n' + err.stack;
      this.write('ERROR', full);
    }
  };
  inst.init();
  // 把初始化前的缓冲日志刷入当日文件（initLogger 之前的报错不再丢失）
  if (_buffer.length) {
    for (const e of _buffer) inst.write(e.level, e.msg);
    _buffer = [];
  }
  _log = inst;
  return _log;
}

function getLog() {
  return _log;
}

/**
 * 当前日志目录的绝对路径（如 C:\Users\x\AppData\Roaming\文档盒 Archbox\logs）。
 *
 * ★ 与数据目录**不是**子目录关系：数据目录默认是 userData/data，日志在 userData/logs，
 *   两者同级。说明页原先写「数据目录的 logs\ 下」是错的，且只说相对位置——
 *   用户按图索骥找不到文件，故这里直接给出可复制的完整路径。
 * 未初始化时返回 null，交由调用方决定如何展示（不猜路径，猜错比不显示更糟）。
 */
function logDir() {
  return _log && _log._dir ? _log._dir : null;
}

module.exports = { initLogger, getLog, setDebug, onWrite, logDir };
