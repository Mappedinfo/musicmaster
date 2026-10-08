# -*- coding: utf-8 -*-
import glob
from playwright.sync_api import sync_playwright

exe = sorted(glob.glob("/Users/shiqi/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))[-1]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=exe, args=[
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
    page = browser.new_page()
    page.goto("http://localhost:8901")
    page.wait_for_load_state("networkidle")
    res = page.evaluate("""async () => {
      // 1) 假设备直通 analyser 的时域能量
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 2048;
      src.connect(an);
      await new Promise(r => setTimeout(r, 1500));
      const td = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(td);
      let rmsMic = 0; for (const v of td) rmsMic += v * v;
      rmsMic = Math.sqrt(rmsMic / td.length);
      // 2) worklet 输入是否拿到非零数据
      const workletCode = 'class P extends AudioWorkletProcessor { process(inputs){ const c = inputs[0] && inputs[0][0]; if (c) { let s=0; for (const v of c) s+=Math.abs(v); this.port.postMessage(s); } return true; } } registerProcessor("p", P);';
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      await ctx.audioWorklet.addModule(URL.createObjectURL(blob));
      const node = new AudioWorkletNode(ctx, 'p');
      src.connect(node); node.connect(ctx.destination);
      const sums = [];
      node.port.onmessage = e => sums.push(e.data);
      await new Promise(r => setTimeout(r, 1500));
      // 3) 振荡器进同一 worklet
      const ctx2 = new AudioContext();
      await ctx2.audioWorklet.addModule(URL.createObjectURL(blob));
      const osc = ctx2.createOscillator(); osc.frequency.value = 220;
      const node2 = new AudioWorkletNode(ctx2, 'p');
      osc.connect(node2); node2.connect(ctx2.destination); osc.start();
      const sums2 = [];
      node2.port.onmessage = e => sums2.push(e.data);
      await new Promise(r => setTimeout(r, 1500));
      return { rmsMic, workletMsgs: sums.length, workletMax: Math.max(0, ...sums), oscMsgs: sums2.length, oscMax: Math.max(0, ...sums2), sr: ctx.sampleRate };
    }""")
    print(res)
    browser.close()
