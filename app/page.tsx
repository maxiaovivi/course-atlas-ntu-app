"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Course = { code: string; name: string; zh: string; color: string };
type Material = {
  id: string;
  course: string;
  shelf: string;
  title: string;
  size: number;
  sha256: string;
  visibility: "public" | "private";
  readable: boolean;
  updatedAt: string;
};
type Session = { signedIn: boolean; owner: boolean; name?: string | null };

const courses: Course[] = [
  { code: "EE6221", name: "Robotics & Intelligent Sensors", zh: "机器人与智能传感", color: "#2db9dd" },
  { code: "EE6406", name: "Analytic & Ensemble Machine Learning", zh: "分析与集成学习", color: "#24c8bd" },
  { code: "EE6407", name: "Genetic Algorithms & Machine Learning", zh: "遗传算法与机器学习", color: "#4d9fe8" },
  { code: "EE6497", name: "Pattern Recognition & Deep Learning", zh: "模式识别与深度学习", color: "#55bfe6" },
];
const materialShelves = ["Lectures", "Assignments", "Study aids", "Quiz", "Exams"];
const shelfFilters = [...materialShelves, "All"];

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}
function UploadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M5 14v5h14v-5" /></svg>;
}
function FileIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7zM14 3v5h5M10 13h5m-5 4h5" /></svg>;
}
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}
function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 19h14" /></svg>;
}
function ShieldIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6z" /><path d="m9 12 2 2 4-5" /></svg>;
}

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function PdfCanvas({ url, page, zoom, onPageCount }: { url: string; page: number; zoom: number; onPageCount: (count: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;
    let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;
    setStatus("loading");
    import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      loadingTask = pdfjs.getDocument({ url, rangeChunkSize: 65536 });
      return loadingTask.promise;
    }).then((document) => {
      if (disposed) return;
      documentRef.current = document;
      onPageCount(document.numPages);
      setVersion((value) => value + 1);
    }).catch((error) => {
      if (!disposed) { console.error(error); setStatus("error"); }
    });
    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
      loadingTask?.destroy();
      documentRef.current = null;
    };
  }, [url, onPageCount]);

  useEffect(() => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (!document || !canvas) return;
    let disposed = false;
    document.getPage(Math.min(page, document.numPages)).then((pdfPage) => {
      if (disposed) return;
      renderTaskRef.current?.cancel();
      const viewport = pdfPage.getViewport({ scale: 1.18 * zoom / 100 });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas unavailable");
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = pdfPage.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      renderTaskRef.current = task;
      return task.promise;
    }).then(() => { if (!disposed) setStatus("ready"); }).catch((error) => {
      if (!disposed && error?.name !== "RenderingCancelledException") setStatus("error");
    });
    return () => { disposed = true; renderTaskRef.current?.cancel(); };
  }, [version, page, zoom]);

  return <div className={`pdf-canvas ${status}`}>
    {status !== "ready" && <div className="pdf-wait"><span /><strong>{status === "error" ? "PDF 加载失败" : "正在从果冻海里捞取这一页…"}</strong><small>{status === "error" ? "请关闭后重试" : "只读取需要显示的字节"}</small></div>}
    <canvas ref={canvasRef} />
  </div>;
}

export default function Home() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [session, setSession] = useState<Session>({ signedIn: false, owner: false });
  const [loaded, setLoaded] = useState(false);
  const [courseCode, setCourseCode] = useState("EE6221");
  const [shelf, setShelf] = useState("All");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Material | null>(null);
  const [pendingAction, setPendingAction] = useState<"read" | "download">("read");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [reader, setReader] = useState<Material | null>(null);
  const [readerUrl, setReaderUrl] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCourse, setUploadCourse] = useState("EE6221");
  const [uploadShelf, setUploadShelf] = useState("Lectures");
  const [uploadVisibility, setUploadVisibility] = useState<"private" | "public">("private");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handledMaterialLinkRef = useRef<string | null>(null);

  const loadLibrary = useCallback(async () => {
    const response = await fetch("/api/library", { cache: "no-store" });
    if (!response.ok) throw new Error("library unavailable");
    const data = await response.json() as { materials?: Material[] };
    setMaterials(Array.isArray(data.materials) ? data.materials : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    Promise.all([
      loadLibrary().catch(() => setLoaded(true)),
      fetch("/api/session", { cache: "no-store" }).then((response) => response.json()).then(setSession).catch(() => undefined),
    ]);
  }, [loadLibrary]);

  useEffect(() => {
    const storedMaterialId = window.sessionStorage.getItem("course-atlas-material-return");
    window.sessionStorage.removeItem("course-atlas-material-return");
    if (!storedMaterialId || !/^[a-z0-9-]{16,96}$/.test(storedMaterialId)) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("material")) return;
    url.searchParams.set("material", storedMaterialId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const clearMaterialQuery = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("material")) return;
    url.searchParams.delete("material");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const closePending = useCallback(() => {
    setPending(null);
    setConfirmError("");
    clearMaterialQuery();
  }, [clearMaterialQuery]);

  const closeReader = useCallback(() => {
    setReader(null);
    setReaderUrl("");
    clearMaterialQuery();
  }, [clearMaterialQuery]);

  useEffect(() => {
    if (!loaded) return;
    const materialId = new URLSearchParams(window.location.search).get("material");
    if (!materialId || handledMaterialLinkRef.current === materialId) return;
    handledMaterialLinkRef.current = materialId;
    const material = materialId.length <= 256 ? materials.find((item) => item.id === materialId) : undefined;
    if (!material) {
      clearMaterialQuery();
      return;
    }
    setCourseCode(material.course);
    setUploadCourse(material.course);
    setShelf(materialShelves.includes(material.shelf) ? material.shelf : "All");
    setQuery("");
    setConfirmError("");
    setPendingAction("read");
    setPending(material);
  }, [clearMaterialQuery, loaded, materials]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (reader) closeReader();
      else if (pending) closePending();
      else if (uploadOpen) setUploadOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePending, closeReader, reader, pending, uploadOpen]);

  const course = courses.find((item) => item.code === courseCode) ?? courses[0];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const shelfOrder = new Map(materialShelves.map((item, index) => [item, index]));
    return materials
      .filter((material) => material.course === courseCode && (shelf === "All" || material.shelf === shelf) && (!needle || material.title.toLowerCase().includes(needle)))
      .sort((left, right) => (shelfOrder.get(left.shelf) ?? 99) - (shelfOrder.get(right.shelf) ?? 99) || left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" }));
  }, [materials, courseCode, shelf, query]);

  const chooseCourse = (code: string) => { setCourseCode(code); setUploadCourse(code); setShelf("All"); };

  const confirmAndProceed = async () => {
    if (!pending) return;
    if (!pending.readable) {
      window.sessionStorage.setItem("course-atlas-material-return", pending.id);
      window.location.href = "/signin-with-chatgpt";
      return;
    }
    setConfirming(true);
    setConfirmError("");
    try {
      const response = await fetch(`/api/materials/${encodeURIComponent(pending.id)}/confirm`, { method: "POST" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "确认失败");
      const materialUrl = `/api/materials/${encodeURIComponent(pending.id)}?v=${encodeURIComponent(pending.sha256.slice(0, 12))}`;
      if (pendingAction === "download") {
        const link = document.createElement("a");
        link.href = `${materialUrl}&download=1`;
        link.download = pending.title;
        document.body.appendChild(link);
        link.click();
        link.remove();
        clearMaterialQuery();
      } else {
        setReaderUrl(materialUrl);
        setReader(pending);
        setPage(1);
        setPageCount(1);
        setZoom(100);
      }
      setPending(null);
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "确认失败");
    } finally { setConfirming(false); }
  };

  const uploadPdf = async () => {
    if (!uploadFile || !session.owner) return;
    if (uploadVisibility === "public" && !rightsConfirmed) { setUploadMessage("公开分享前需要确认你拥有分享权利。"); return; }
    setUploadStatus("uploading");
    setUploadMessage("");
    const params = new URLSearchParams({
      course: uploadCourse,
      shelf: uploadShelf,
      title: uploadFile.name,
      visibility: uploadVisibility,
      rightsConfirmed: rightsConfirmed ? "1" : "0",
    });
    try {
      const response = await fetch(`/api/upload?${params}`, { method: "POST", headers: { "content-type": "application/pdf" }, body: uploadFile });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "上传失败");
      await loadLibrary();
      setCourseCode(uploadCourse);
      setShelf(uploadShelf);
      setUploadStatus("done");
      setUploadMessage("上传完成，资料已经出现在列表里。");
      setUploadFile(null);
    } catch (error) {
      setUploadStatus("error");
      setUploadMessage(error instanceof Error ? error.message : "上传失败");
    }
  };

  return <main>
    <div className="sea-glow" /><div className="shore" /><div className="water-lines" />
    <header className="topbar shell">
      <a className="brand" href="#top"><span className="brand-jelly">知</span><span><strong>知屿</strong><small>NTU STUDY ATLAS</small></span></a>
      <div className="top-actions"><span className="public-badge"><i /> 公共访问</span><button className="upload-button" onClick={() => { setUploadCourse(courseCode); setUploadOpen(true); }}><UploadIcon />上传 PDF</button></div>
    </header>

    <section className="intro shell" id="top">
      <div><span className="overline">NTU STUDY MATERIALS</span><h1>课程资料库</h1><p>按课程与资料类型整理。选择文件，确认后加载 PDF。</p></div>
      <div className="sea-orb"><small>已收录</small><span>{materials.length}</span><strong>份 PDF</strong></div>
    </section>

    <section className="library shell">
      <div className="library-bar">
        <div className="course-tabs" role="tablist" aria-label="Courses">
          {courses.map((item) => <button key={item.code} className={courseCode === item.code ? "active" : ""} onClick={() => chooseCourse(item.code)} style={{ "--tab-color": item.color } as React.CSSProperties}><span>{item.code}</span><small>{materials.filter((material) => material.course === item.code).length}</small></button>)}
        </div>
        <label className="search"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 PDF…" /></label>
      </div>

      <div className="course-heading"><div><small>{course.code}</small><h2>{course.name}</h2><p>{course.zh}</p></div><span>{materials.filter((material) => material.course === courseCode).length} 份资料</span></div>
      <div className="shelf-tabs" role="tablist" aria-label="Material types">
        {shelfFilters.map((item) => ({ item, count: materials.filter((material) => material.course === courseCode && (item === "All" || material.shelf === item)).length })).filter(({ item, count }) => item === "All" || count > 0).map(({ item, count }) => <button key={item} className={shelf === item ? "active" : ""} onClick={() => setShelf(item)}>{item}<small>{count}</small></button>)}
      </div>

      <div className="file-list">
        {loaded && visible.length > 0 && <div className="file-columns"><span>文件</span><span>类型</span><span>大小</span><span>访问</span><span>操作</span></div>}
        {!loaded && [1,2,3,4].map((item) => <div className="file-card skeleton" key={item} />)}
        {loaded && visible.map((material, index) => <div className="file-card" key={material.id} style={{ "--delay": `${Math.min(index, 8) * 35}ms` } as React.CSSProperties}>
          <span className="file-icon"><FileIcon /></span>
          <span className="file-copy"><strong>{material.title}</strong><small>{material.course}</small></span>
          <span className="file-type">{material.shelf}</span>
          <span className="file-size">{formatBytes(material.size)}</span>
          <span className={`access-pill ${material.visibility}`}>{material.visibility === "public" ? "PUBLIC" : material.readable ? "PRIVATE" : "OWNER"}</span>
          <span className="file-actions">
            <button onClick={() => { setConfirmError(""); setPendingAction("read"); setPending(material); }}>阅读</button>
            <button className="download" aria-label={`下载 ${material.title}`} title="下载 PDF" onClick={() => { setConfirmError(""); setPendingAction("download"); setPending(material); }}><DownloadIcon /></button>
          </span>
        </div>)}
        {loaded && visible.length === 0 && <div className="empty"><span>∿</span><strong>这里还是一片浅海</strong><small>换个分类，或者直接上传一份 PDF。</small></div>}
      </div>
    </section>

    <footer className="shell"><span>知屿 · Course Atlas</span><p>课程资料版权归南洋理工大学（NTU）所有，仅供 NTU 学生学习交流。</p><small>NON-COMMERCIAL STUDY USE · 2026</small></footer>

    {pending && <div className="overlay" onMouseDown={closePending}><section className="confirm-card" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close" onClick={closePending}>×</button><span className="confirm-icon"><ShieldIcon /></span><small>加载前确认</small><h2>{pending.title}</h2>
      <div className="confirm-meta"><span>{pending.course}</span><span>{pending.shelf}</span><span>{formatBytes(pending.size)}</span></div>
      <p>{pending.visibility === "public" ? "这份 PDF 已被上传者标记为可公开分享。确认后，阅读器才会开始请求文件内容。" : pending.readable ? "这是受保护的课程资料。确认仅用于个人学习，并遵守课程材料的使用范围后再加载。" : "这份 NTU 课程资料没有公开分发许可。公共访客可以浏览目录，但只有资料库所有者登录后才能读取。"}</p>
      <div className="copyright-note"><strong>版权与使用范围</strong><span>课程资料版权归南洋理工大学（NTU）所有，仅供 NTU 学生学习交流。禁止商业使用或再次传播。</span></div>
      {confirmError && <div className="inline-error">{confirmError}</div>}
      <button className="primary-action" disabled={confirming} onClick={confirmAndProceed}>{confirming ? "正在确认…" : pending.readable ? pendingAction === "download" ? "确认并下载 PDF" : "确认并阅读 PDF" : pendingAction === "download" ? "所有者登录后下载" : "所有者登录后读取"}{pendingAction === "download" ? <DownloadIcon /> : <ArrowIcon />}</button>
      <small className="confirm-foot">确认之前不会读取或下载 PDF</small>
    </section></div>}

    {uploadOpen && <div className="overlay" onMouseDown={() => setUploadOpen(false)}><section className="upload-card" onMouseDown={(event) => event.stopPropagation()}>
      <button className="close" onClick={() => setUploadOpen(false)}>×</button><span className="modal-label">UPLOAD PDF</span><h2>放进资料库</h2><p>访问网站不需要登录；为了防止公共存储被滥用，上传仅限资料库所有者。</p>
      {!session.owner ? <div className="signin-panel"><ShieldIcon /><strong>需要所有者身份</strong><small>登录只用于上传权限，不影响任何人浏览公开网站。</small><a href="/signin-with-chatgpt">使用 ChatGPT 登录</a></div> : <>
        <div className="upload-course-tabs">{courses.map((item) => <button key={item.code} className={uploadCourse === item.code ? "active" : ""} onClick={() => setUploadCourse(item.code)}>{item.code}</button>)}</div>
        <div className="upload-shelf-tabs">{materialShelves.map((item) => <button key={item} className={uploadShelf === item ? "active" : ""} onClick={() => setUploadShelf(item)}>{item}</button>)}</div>
        <button className={`drop-zone ${uploadFile ? "has-file" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf")) setUploadFile(file); }}><UploadIcon /><strong>{uploadFile ? uploadFile.name : "选择或拖入 PDF"}</strong><small>{uploadFile ? formatBytes(uploadFile.size) : "单个文件不超过 75 MB"}</small></button>
        <input ref={fileInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
        <div className="visibility-tabs"><button className={uploadVisibility === "private" ? "active" : ""} onClick={() => setUploadVisibility("private")}><strong>仅自己</strong><small>适合课程受限资料</small></button><button className={uploadVisibility === "public" ? "active" : ""} onClick={() => setUploadVisibility("public")}><strong>公开分享</strong><small>所有访客确认后可读</small></button></div>
        {uploadVisibility === "public" && <label className="rights-check"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} /><span>我确认拥有公开分享这份文件的权利，且文件不含个人或敏感信息。</span></label>}
        {uploadMessage && <div className={`upload-message ${uploadStatus}`}>{uploadMessage}</div>}
        <button className="primary-action" disabled={!uploadFile || uploadStatus === "uploading" || (uploadVisibility === "public" && !rightsConfirmed)} onClick={uploadPdf}>{uploadStatus === "uploading" ? "正在上传…" : "上传到资料库"}<UploadIcon /></button>
      </>}
    </section></div>}

    {reader && <div className="reader-overlay"><section className="reader-shell">
      <header><div><span className="reader-file-icon"><FileIcon /></span><span><small>{reader.course} · {reader.shelf}</small><strong>{reader.title}</strong></span></div><div className="reader-tools"><button onClick={() => setZoom((value) => Math.max(60, value - 10))}>−</button><span>{zoom}%</span><button onClick={() => setZoom((value) => Math.min(180, value + 10))}>＋</button><a className="reader-download" href={`${readerUrl}&download=1`} download={reader.title} title="下载 PDF" aria-label={`下载 ${reader.title}`}><DownloadIcon /></a><button className="reader-close" onClick={closeReader}>×</button></div></header>
      <div className="reader-stage"><PdfCanvas url={readerUrl} page={page} zoom={zoom} onPageCount={setPageCount} /></div>
      <footer><button onClick={() => setPage((value) => Math.max(1, value - 1))}>←</button><span>PAGE <strong>{page}</strong> / {pageCount}</span><button onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>→</button></footer>
    </section></div>}
  </main>;
}
