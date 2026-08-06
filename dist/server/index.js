const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="用于测试网页能否被其他人直接访问的公开页面">
  <title>公开访问测试 · 0806</title>
  <style>
    :root{--ink:#181a20;--paper:#f2efe6;--orange:#ff5a1f;--acid:#d7f64a;--line:rgba(24,26,32,.18)}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif}button,a{font:inherit}
    .shell{min-height:100vh;overflow:hidden;position:relative;padding:0 5vw 32px;background-image:linear-gradient(rgba(24,26,32,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(24,26,32,.04) 1px,transparent 1px);background-size:32px 32px}
    .glow{position:absolute;pointer-events:none;border-radius:999px}.g1{width:420px;height:420px;right:-140px;top:80px;background:radial-gradient(circle,rgba(255,90,31,.33),rgba(255,90,31,0) 70%)}.g2{width:300px;height:300px;left:-120px;top:430px;background:radial-gradient(circle,rgba(215,246,74,.54),rgba(215,246,74,0) 70%)}
    nav{position:relative;z-index:1;height:96px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ink);font-size:12px;font-weight:800;letter-spacing:.14em}.brand{color:inherit;text-decoration:none;display:flex;align-items:center;gap:12px}.mark{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;color:var(--paper);background:var(--ink);letter-spacing:0}.status{display:flex;align-items:center;gap:8px}.status i{width:9px;height:9px;border-radius:50%;background:#26a852;box-shadow:0 0 0 5px rgba(38,168,82,.13)}
    .hero{position:relative;z-index:1;display:grid;grid-template-columns:1.35fr .65fr;column-gap:7vw;padding:clamp(70px,11vh,128px) 0 72px}.eyebrow{grid-column:1/-1;display:flex;align-items:center;gap:14px;margin-bottom:28px;color:#5c5e64;font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}.eyebrow span{color:var(--orange)}
    h1{grid-column:1;margin:0;max-width:940px;font-size:clamp(52px,7.4vw,112px);line-height:.94;letter-spacing:-.065em;font-weight:900}h1 span{display:block;color:var(--orange)}.lede{grid-column:2;align-self:end;max-width:480px;margin:0 0 10px;font-size:clamp(16px,1.4vw,20px);line-height:1.8;color:#4d4f55}
    .actions{grid-column:1/-1;display:flex;align-items:center;gap:22px;margin-top:56px}.actions p{margin:0;color:#6c6e73;font-size:13px}.verify{min-width:250px;padding:9px 9px 9px 22px;border:1px solid var(--ink);border-radius:999px;display:flex;align-items:center;justify-content:space-between;gap:24px;background:var(--ink);color:white;cursor:pointer;transition:transform .18s ease,background .2s ease}.verify:hover{transform:translateY(-2px)}.verify:focus-visible{outline:4px solid rgba(255,90,31,.32);outline-offset:3px}.verify b{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--orange);font-size:17px}.verify.done{background:#196f3d;border-color:#196f3d}.verify.done b{background:var(--acid);color:var(--ink)}
    .grid{position:relative;z-index:1;display:grid;grid-template-columns:1.6fr 1fr 1fr;border-top:1px solid var(--ink);border-left:1px solid var(--ink)}article{min-height:184px;padding:24px;display:flex;flex-direction:column;justify-content:space-between;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink);background:rgba(242,239,230,.55);backdrop-filter:blur(6px)}article:first-child{background:var(--acid)}.idx{font-size:11px;font-weight:900}.label{margin:0 0 12px;font-size:11px;color:#61636a;text-transform:uppercase;letter-spacing:.16em}article h2{margin:0;font-size:clamp(21px,2.1vw,34px);line-height:1.12;letter-spacing:-.04em}
    footer{position:relative;z-index:1;padding-top:26px;display:flex;justify-content:space-between;gap:16px;color:#72747a;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
    @media(max-width:820px){.shell{padding-inline:22px}nav{height:76px}.hero{grid-template-columns:1fr;padding-top:72px}h1,.lede{grid-column:1}.lede{margin-top:34px}.actions{flex-direction:column;align-items:flex-start;margin-top:36px}.grid{grid-template-columns:1fr}article{min-height:145px}}
    @media(max-width:520px){.brand span:last-child{display:none}.hero{padding-bottom:52px}h1{font-size:51px}.verify{width:100%}footer{flex-direction:column}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
  </style>
</head>
<body>
  <main class="shell">
    <div class="glow g1"></div><div class="glow g2"></div>
    <nav><a class="brand" href="#top"><span class="mark">Y</span><span>WEB TEST / 0806</span></a><span class="status"><i></i> LIVE</span></nav>
    <section class="hero" id="top">
      <div class="eyebrow"><span>01</span> Public access experiment</div>
      <h1>如果你看见这里，<span>网页已经抵达你。</span></h1>
      <p class="lede">这是一个用于检验公网访问的临时页面。把当前网址发给朋友，或在未登录的无痕窗口中打开，即可判断其他人能否直接访问。</p>
      <div class="actions"><button class="verify" id="verify" type="button"><span>点击验证页面交互</span><b>→</b></button><p id="message" aria-live="polite">无需注册或填写任何信息</p></div>
    </section>
    <section class="grid" aria-label="访问状态">
      <article><span class="idx">A</span><div><p class="label">浏览器本地时间</p><h2 id="clock">正在读取…</h2></div></article>
      <article><span class="idx">B</span><div><p class="label">当前状态</p><h2>页面在线</h2></div></article>
      <article><span class="idx">C</span><div><p class="label">推荐测试</p><h2>无痕窗口打开</h2></div></article>
    </section>
    <footer><span>Built for a simple question.</span><span>Public test · Singapore · 2026</span></footer>
  </main>
  <script>
    const clock=document.querySelector('#clock');
    const updateClock=()=>clock.textContent=new Intl.DateTimeFormat('zh-CN',{dateStyle:'full',timeStyle:'medium'}).format(new Date());
    updateClock();setInterval(updateClock,1000);
    const button=document.querySelector('#verify');
    button.addEventListener('click',()=>{button.classList.add('done');button.querySelector('span').textContent='验证成功';button.querySelector('b').textContent='✓';document.querySelector('#message').textContent='按钮工作正常，这不是一张静态截图。'});
  </script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    void env;
    void ctx;
    if (new URL(request.url).pathname !== "/") return new Response("Not found", { status: 404 });
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
