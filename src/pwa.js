// ============================================================
// 安装为本地应用：Chrome / Edge 的应用窗口，iOS 的主屏幕图标
// 说明：安装提示事件必须在页面早期监听，因此模块加载时就注册。
// ============================================================
import { useEffect, useState } from 'react';

let deferredPrompt = null;
let justInstalled = false;
const subscribers = new Set();

function emit() {
  for (const notify of subscribers) notify();
}

/** 已经以独立窗口打开（安装后再次进入）。 */
export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
}

/** iOS 没有 beforeinstallprompt，只能引导用户手动“添加到主屏幕”。 */
export function isIos() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function currentState() {
  const standalone = isStandalone();
  const ios = isIos();
  return {
    // 独立窗口或刚装完就不再提示；其余情况在浏览器提供安装事件或 iOS 时给出入口。
    visible: !standalone && !justInstalled && (!!deferredPrompt || ios),
    manual: ios && !deferredPrompt,
  };
}

async function promptInstall() {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();
  event.prompt();
  let accepted = false;
  try {
    const choice = await event.userChoice;
    accepted = !!choice && choice.outcome === 'accepted';
  } catch (err) {
    accepted = false;
  }
  if (accepted) justInstalled = true;
  emit();
  return accepted;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    justInstalled = true;
    emit();
  });
}

/**
 * 注册 Service Worker（构建产物里的 sw.js），负责离线打开与缓存更新。
 * 开发模式不注册，避免缓存干扰热更新；失败只降级为“不能离线”，不影响使用。
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href)
      .catch(error => console.warn('Service worker registration failed', error));
  });
}

export function useInstallPrompt() {
  const [state, setState] = useState(currentState);
  useEffect(() => {
    const update = () => setState(currentState());
    subscribers.add(update);
    update();
    return () => { subscribers.delete(update); };
  }, []);
  return { ...state, start: promptInstall };
}
