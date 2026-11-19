'use strict';
window.KIDO = {
  cache: new Map(), pending: new Map(), timeoutMs: 45000,
  put(k,v) {
    this.cache.set(k,v);
    const entry = this.pending.get(k);
    if (entry) { clearTimeout(entry.timer); this.pending.delete(k); entry.resolve(v); }
  },
  load(k) {
    if (!/^[a-z0-9-]+$/.test(k)) return Promise.reject(Error('不正な資料名です'));
    if (this.cache.has(k)) return Promise.resolve(this.cache.get(k));
    if (this.pending.has(k)) return this.pending.get(k).promise;
    let resolve, reject;
    const promise = new Promise((a,b) => { resolve = a; reject = b; });
    const entry = {promise,resolve,reject,timer:null}; this.pending.set(k,entry);
    const s = document.createElement('script'); s.src = 'data/' + k + '.js';
    const fail = message => {
      s.remove();
      if (this.pending.get(k) !== entry) return;
      clearTimeout(entry.timer); this.pending.delete(k); reject(Error(message));
    };
    s.onerror = () => fail('資料を読み込めませんでした。再読み込みしてください。');
    s.onload = () => { if (!this.cache.has(k)) fail('資料の形式を確認できません：'+k); else s.remove(); };
    entry.timer = setTimeout(() => fail('読み込みに時間がかかっています。再読み込みしてください。'),this.timeoutMs);
    document.head.append(s); return promise;
  }
};
