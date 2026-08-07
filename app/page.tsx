"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Course = {
  code: string;
  title: string;
  shortTitle: string;
  description: string;
  accent: string;
  accentSoft: string;
  files: number;
  progress: number;
  next: string;
  topics: string[];
  shelves: { label: string; count: number; note: string }[];
};

type Material = {
  id: string;
  course: string;
  shelf: string;
  title: string;
  size: number;
  source: string;
  sha256: string;
  updatedAt: string;
};

const courses: Course[] = [
  {
    code: "EE6221",
    title: "Robotics & Intelligent Sensors",
    shortTitle: "Robotics",
    description: "从运动学、控制与移动机器人，到视觉、位姿估计和多传感器融合。",
    accent: "#58d4ee",
    accentSoft: "rgba(88, 212, 238, .16)",
    files: 18,
    progress: 46,
    next: "Wednesday · 18:30",
    topics: ["Kinematics", "Robot Control", "Vision", "Kalman Filter"],
    shelves: [
      { label: "Lectures", count: 10, note: "Kinematics → vision" },
      { label: "Assignments", count: 2, note: "Official briefs" },
      { label: "Quiz", count: 1, note: "Review material" },
      { label: "Exams", count: 5, note: "Official papers" },
    ],
  },
  {
    code: "EE6406",
    title: "Analytic & Ensemble Machine Learning",
    shortTitle: "Ensemble ML",
    description: "覆盖统计学习、集成方法、模型评估，以及从理论到 notebook 的完整路径。",
    accent: "#55e1c5",
    accentSoft: "rgba(85, 225, 197, .15)",
    files: 16,
    progress: 29,
    next: "13 lecture sets",
    topics: ["Analytics", "Ensembles", "Evaluation", "Notebooks"],
    shelves: [
      { label: "Lectures", count: 14, note: "AY2024–25 S2" },
      { label: "Assignments", count: 0, note: "No PDF indexed" },
      { label: "Study aids", count: 0, note: "No PDF indexed" },
      { label: "Exams", count: 2, note: "Official papers" },
    ],
  },
  {
    code: "EE6407",
    title: "Genetic Algorithms & Machine Learning",
    shortTitle: "GA & ML",
    description: "遗传算法、贝叶斯决策、LDA、SVM、分类树、聚类与系统化考试训练。",
    accent: "#69aef8",
    accentSoft: "rgba(105, 174, 248, .16)",
    files: 36,
    progress: 63,
    next: "Highest exam coverage",
    topics: ["Genetic Algorithms", "SVM", "LDA", "Clustering"],
    shelves: [
      { label: "Lectures", count: 26, note: "Curated sequence" },
      { label: "Assignments", count: 3, note: "Official briefs" },
      { label: "Quiz", count: 1, note: "Historical paper" },
      { label: "Exams", count: 6, note: "EE6407 + EE6227" },
    ],
  },
  {
    code: "EE6497",
    title: "Pattern Recognition & Deep Learning",
    shortTitle: "Deep Learning",
    description: "从概率模型到神经网络与 CNN，用两阶段复习路线连接 Quiz 和期末考试。",
    accent: "#7fe5ff",
    accentSoft: "rgba(127, 229, 255, .15)",
    files: 6,
    progress: 38,
    next: "Quiz 1 → Quiz 2",
    topics: ["Probability", "Pattern Recognition", "Neural Nets", "CNN"],
    shelves: [
      { label: "Study aids", count: 1, note: "Formula sheet" },
      { label: "Quiz", count: 2, note: "Two-stage prep" },
      { label: "Exams", count: 3, note: "EE6497 + IE4497" },
    ],
  },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" /></svg>
  );
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.7 5.3 2.7 7.3 8 8-5.3.7-7.3 2.7-8 8-.7-5.3-2.7-7.3-8-8 5.3-.7 7.3-2.7 8-8Z" /></svg>;
}

function FileIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7zM14 3v5h5M10 13h5m-5 4h5" /></svg>;
}

function ReaderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22zm16 0A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22z" /></svg>;
}

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function PdfCanvas({ url, page, zoom, onPageCount }: { url: string; page: number; zoom: number; onPageCount: (count: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;
    let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;

    const load = async () => {
      try {
        setStatus("loading");
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument({ url, rangeChunkSize: 65536 });
        const document = await loadingTask.promise;
        if (disposed) return;
        documentRef.current = document;
        onPageCount(document.numPages);
        setDocumentVersion((value) => value + 1);
      } catch (error) {
        if (!disposed) {
          console.error("Unable to load PDF", error);
          setStatus("error");
        }
      }
    };

    load();
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

    const render = async () => {
      try {
        renderTaskRef.current?.cancel();
        const pdfPage = await document.getPage(Math.min(page, document.numPages));
        if (disposed) return;
        const viewport = pdfPage.getViewport({ scale: 1.2 * (zoom / 100) });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas is unavailable");
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (!disposed) setStatus("ready");
      } catch (error) {
        if (!disposed && (error as { name?: string }).name !== "RenderingCancelledException") {
          console.error("Unable to render PDF page", error);
          setStatus("error");
        }
      }
    };

    render();
    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
    };
  }, [documentVersion, page, zoom]);

  return (
    <div className={`pdf-canvas-wrap ${status}`}>
      {status === "loading" && <div className="pdf-loading"><span /><strong>正在从存储空间读取 PDF</strong><small>Preparing byte ranges…</small></div>}
      {status === "error" && <div className="pdf-loading error"><strong>PDF 暂时无法读取</strong><small>请检查 Sites 文件存储绑定。</small></div>}
      <canvas ref={canvasRef} aria-label={`PDF page ${page}`} />
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [reader, setReader] = useState<{ course: Course; shelf: Course["shelves"][number]; materials: Material[] } | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [view, setView] = useState<"grid" | "focus">("grid");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [pageCount, setPageCount] = useState(3);
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/library", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Library request failed: ${response.status}`);
        return response.json() as Promise<{ materials?: Material[]; storageAvailable?: boolean }>;
      })
      .then((data) => {
        setMaterials(Array.isArray(data.materials) ? data.materials : []);
        setStorageAvailable(Boolean(data.storageAvailable));
        setCatalogLoaded(true);
      })
      .catch(() => {
        setCatalogError(true);
        setStorageAvailable(false);
        setCatalogLoaded(true);
      });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (reader) setReader(null);
        else setActiveCourse(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reader]);

  const activeMaterial = reader
    ? reader.materials.find((material) => material.id === selectedMaterialId) ?? reader.materials[0] ?? null
    : null;

  const materialsFor = (courseCode: string, shelfLabel: string) =>
    materials.filter((material) => material.course === courseCode && material.shelf === shelfLabel);

  const openShelf = (course: Course, shelf: Course["shelves"][number]) => {
    const shelfMaterials = materialsFor(course.code, shelf.label);
    setReader({ course, shelf, materials: shelfMaterials });
    setSelectedMaterialId(shelfMaterials[0]?.id ?? null);
    setPage(1);
    setPageCount(1);
    setZoom(100);
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return courses;
    return courses.filter((course) =>
      [course.code, course.title, course.description, ...course.topics]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query]);

  return (
    <main>
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <div className="caustics" aria-hidden="true" />

      <header className="topbar shell">
        <a className="brand" href="#top" aria-label="Course Atlas home">
          <span className="brand-mark"><SparkIcon /></span>
          <span><strong>知屿</strong><small>COURSE ATLAS</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#library">Library</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#about">About</a>
        </nav>
        <div className="profile" title="Shared course library">
          <span className="status-dot" />
          <span className="profile-copy"><strong>Study circle</strong><small>Shared library</small></span>
          <span className="avatar">Y</span>
        </div>
      </header>

      <section className="hero shell" id="top">
        <div className="eyebrow"><span>AY 2026–27</span><i />SEMESTER 1</div>
        <div className="hero-grid">
          <div>
            <h1>让知识沉入深海，<br /><em>再被温柔照亮。</em></h1>
            <p>一座为课程资料而建的蓝色岛屿。讲义、测验、往年试卷与学习路径各归其位，让你和同行的人随时找到方向。</p>
          </div>
          <div className="orbit-card" aria-label="Library overview">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="planet"><span>4</span><small>COURSES</small></div>
            <span className="satellite satellite-a" />
            <span className="satellite satellite-b" />
            <span className="satellite satellite-c" />
            <div className="orbit-note"><strong>{catalogLoaded ? materials.length : "···"}</strong><span>protected PDFs</span></div>
          </div>
        </div>
      </section>

      <section className="library shell" id="library">
        <div className="section-head">
          <div><span className="section-index">01</span><h2>Your library</h2><p>四门课程，一套清晰的学习坐标。</p></div>
          <div className="library-tools">
            <label className="search"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程或主题…" /><kbd>⌘ K</kbd></label>
            <div className="view-switch" aria-label="View switcher">
              <button className={view === "grid" ? "selected" : ""} onClick={() => setView("grid")} aria-label="Grid view">▦</button>
              <button className={view === "focus" ? "selected" : ""} onClick={() => setView("focus")} aria-label="Focus view">☰</button>
            </div>
          </div>
        </div>

        <div className={`course-grid ${view === "focus" ? "focus-view" : ""}`}>
          {filtered.map((course, index) => (
            <article className="course-card" key={course.code} style={{ "--accent": course.accent, "--accent-soft": course.accentSoft } as React.CSSProperties}>
              <div className="card-top"><span className="course-number">0{index + 1}</span><span className="file-count">{catalogLoaded ? materials.filter((material) => material.course === course.code).length : course.files} PDF</span></div>
              <div className="course-symbol"><span /><i /></div>
              <div className="course-code">{course.code}</div>
              <h3>{course.shortTitle}</h3>
              <p>{course.description}</p>
              <div className="tags">{course.topics.slice(0, 3).map((topic) => <span key={topic}>{topic}</span>)}</div>
              <div className="progress-row"><span><i style={{ width: `${course.progress}%` }} /></span><small>{course.progress}% mapped</small></div>
              <button className="open-course" onClick={() => setActiveCourse(course)}>进入课程 <ArrowIcon /></button>
            </article>
          ))}
          {filtered.length === 0 && <div className="empty-state"><SparkIcon /><h3>暂时没有匹配项</h3><p>试试课程代码、SVM、CNN 或 Robotics。</p></div>}
        </div>
      </section>

      <section className="roadmap shell" id="roadmap">
        <div className="roadmap-copy">
          <span className="section-index">02</span>
          <h2>This week’s orbit</h2>
          <p>真实课程 PDF 已接入受控存储；阅读器只渲染当前页面，并按需读取文件字节范围。</p>
        </div>
        <div className="timeline">
          <div className="timeline-line" />
          <div className="timeline-item active"><span>01</span><div><small>LIVE</small><strong>资料地图</strong><p>{materials.length || 76} 份课程 PDF 已整理</p></div></div>
          <div className="timeline-item active"><span>02</span><div><small>LIVE</small><strong>PDF 阅读</strong><p>从私有对象存储分段加载</p></div></div>
          <div className="timeline-item"><span>03</span><div><small>LATER</small><strong>全文搜索</strong><p>跨课程定位知识点</p></div></div>
        </div>
      </section>

      <footer className="shell" id="about"><span>知屿 · Course Atlas</span><p>Built for a small circle of curious minds.</p><small>SHARED LIBRARY · 2026</small></footer>

      {activeCourse && (
        <div className="modal-backdrop" onMouseDown={() => setActiveCourse(null)}>
          <section className="course-modal" onMouseDown={(event) => event.stopPropagation()} style={{ "--accent": activeCourse.accent, "--accent-soft": activeCourse.accentSoft } as React.CSSProperties}>
            <button className="close" onClick={() => setActiveCourse(null)} aria-label="Close">×</button>
            <span className="modal-kicker">{activeCourse.code} · COURSE MAP</span>
            <h2>{activeCourse.title}</h2>
            <p>{activeCourse.description}</p>
            <div className="modal-stat"><span><strong>{catalogLoaded ? materials.filter((material) => material.course === activeCourse.code).length : activeCourse.files}</strong><small>protected PDFs</small></span><span><strong>{activeCourse.progress}%</strong><small>mapped</small></span><span><strong>{activeCourse.next}</strong><small>study signal</small></span></div>
            <div className="shelf-grid">
              {activeCourse.shelves.map((shelf) => {
                const count = catalogLoaded ? materialsFor(activeCourse.code, shelf.label).length : shelf.count;
                return <button key={shelf.label} disabled={catalogLoaded && count === 0} onClick={() => openShelf(activeCourse, shelf)}><span>{count}</span><span className="shelf-copy"><strong>{shelf.label}</strong><small>{count ? shelf.note : "No PDF indexed"}</small></span><ArrowIcon /></button>;
              })}
            </div>
            <div className={`notice ${catalogError ? "warning" : ""}`}><SparkIcon /><span><strong>{catalogError ? "目录暂时无法读取" : catalogLoaded ? "Protected vault connected" : "正在读取课程目录"}</strong>{catalogError ? "请刷新页面重试；本地 Vault 未受到影响。" : "点击任一非空分类，直接阅读 ntu_study 中筛选并上传的真实 PDF。"}</span></div>
          </section>
        </div>
      )}

      {reader && (
        <div className="reader-backdrop" onMouseDown={() => setReader(null)}>
          <section className="reader" onMouseDown={(event) => event.stopPropagation()}>
            <header className="reader-topbar">
              <div className="reader-title"><span className="reader-file"><FileIcon /></span><span><small>{reader.course.code} · {reader.shelf.label}</small><strong>{activeMaterial?.title ?? "该分类暂无 PDF"}</strong></span></div>
              <div className="reader-tools">
                <button onClick={() => setZoom((value) => Math.max(60, value - 10))} aria-label="Zoom out">−</button>
                <span>{zoom}%</span>
                <button onClick={() => setZoom((value) => Math.min(180, value + 10))} aria-label="Zoom in">＋</button>
                <i />
                <button className="reader-close" onClick={() => setReader(null)} aria-label="Close reader">×</button>
              </div>
            </header>
            <div className="reader-layout">
              <aside className="reader-sidebar">
                <div className="reader-tabs"><button className="selected">Files</button><span>{reader.materials.length}</span></div>
                <div className="material-list">
                  {reader.materials.map((material) => <button className={`material-item ${activeMaterial?.id === material.id ? "active" : ""}`} onClick={() => { setSelectedMaterialId(material.id); setPage(1); setPageCount(1); }} key={material.id}><span className="material-icon"><FileIcon /></span><span><strong>{material.title}</strong><small>{formatBytes(material.size)}</small></span></button>)}
                </div>
              </aside>
              <div className="reader-stage">
                <div className="depth-indicator"><span className="status-dot" /> {storageAvailable === null ? "CHECKING STORAGE" : storageAvailable ? "PROTECTED R2 LIBRARY" : "STORAGE UNAVAILABLE"}</div>
                {activeMaterial ? <PdfCanvas url={`/api/materials/${encodeURIComponent(activeMaterial.id)}`} page={page} zoom={zoom} onPageCount={setPageCount} /> : <div className="reader-empty"><ReaderIcon /><strong>这个分类暂时没有 PDF</strong><small>返回课程地图选择一个非空分类。</small></div>}
              </div>
              <aside className="reader-info">
                <span className="reader-info-icon"><ReaderIcon /></span>
                <small>DOCUMENT SOURCE</small>
                <h3>{activeMaterial ? "真实课程资料" : "请选择资料"}</h3>
                <p>{activeMaterial ? activeMaterial.source.split("/").slice(-4).join(" / ") : "当前分类没有可阅读的 PDF。"}</p>
                <dl><div><dt>Size</dt><dd>{activeMaterial ? formatBytes(activeMaterial.size) : "—"}</dd></div><div><dt>Transport</dt><dd>Range requests</dd></div><div><dt>Render</dt><dd>Visible page only</dd></div><div><dt>Access</dt><dd>Account protected</dd></div></dl>
                <div className="reader-note"><span className="status-dot" /><span><strong>{storageAvailable ? "Vault copy online" : "Storage unavailable"}</strong><small>{activeMaterial ? `${reader.course.code} · ${reader.shelf.label} · 校验 ${activeMaterial.sha256.slice(0, 8)}` : "没有加载测试占位文件"}</small></span></div>
              </aside>
            </div>
            <div className="reader-bottombar"><button disabled={!activeMaterial} onClick={() => setPage((value) => Math.max(1, value - 1))}>←</button><span>{activeMaterial ? <>PAGE <strong>{page}</strong> / {pageCount}</> : "NO DOCUMENT"}</span><button disabled={!activeMaterial} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>→</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
