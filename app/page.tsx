"use client";

import { useMemo, useState } from "react";

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

const courses: Course[] = [
  {
    code: "EE6221",
    title: "Robotics & Intelligent Sensors",
    shortTitle: "Robotics",
    description: "从运动学、控制与移动机器人，到视觉、位姿估计和多传感器融合。",
    accent: "#ff8a5c",
    accentSoft: "rgba(255, 138, 92, .18)",
    files: 135,
    progress: 46,
    next: "Wednesday · 18:30",
    topics: ["Kinematics", "Robot Control", "Vision", "Kalman Filter"],
    shelves: [
      { label: "Current", count: 1, note: "AY2026–27 S1" },
      { label: "Lectures", count: 14, note: "Historical core" },
      { label: "Quiz", count: 3, note: "Recall & analysis" },
      { label: "Exams", count: 11, note: "Official papers" },
    ],
  },
  {
    code: "EE6406",
    title: "Analytic & Ensemble Machine Learning",
    shortTitle: "Ensemble ML",
    description: "覆盖统计学习、集成方法、模型评估，以及从理论到 notebook 的完整路径。",
    accent: "#75d8bd",
    accentSoft: "rgba(117, 216, 189, .17)",
    files: 51,
    progress: 29,
    next: "13 lecture sets",
    topics: ["Analytics", "Ensembles", "Evaluation", "Notebooks"],
    shelves: [
      { label: "Current", count: 1, note: "Course status" },
      { label: "Lectures", count: 18, note: "AY2025–26 S2" },
      { label: "Notebooks", count: 6, note: "Practice code" },
      { label: "Exams", count: 5, note: "Past papers" },
    ],
  },
  {
    code: "EE6407",
    title: "Genetic Algorithms & Machine Learning",
    shortTitle: "GA & ML",
    description: "遗传算法、贝叶斯决策、LDA、SVM、分类树、聚类与系统化考试训练。",
    accent: "#9a8cff",
    accentSoft: "rgba(154, 140, 255, .18)",
    files: 688,
    progress: 63,
    next: "Highest exam coverage",
    topics: ["Genetic Algorithms", "SVM", "LDA", "Clustering"],
    shelves: [
      { label: "Current", count: 1, note: "Course status" },
      { label: "Study archive", count: 133, note: "Curated history" },
      { label: "Quiz", count: 4, note: "Practice set" },
      { label: "Exams", count: 7, note: "EE6407 + EE6227" },
    ],
  },
  {
    code: "EE6497",
    title: "Pattern Recognition & Deep Learning",
    shortTitle: "Deep Learning",
    description: "从概率模型到神经网络与 CNN，用两阶段复习路线连接 Quiz 和期末考试。",
    accent: "#62b7ff",
    accentSoft: "rgba(98, 183, 255, .18)",
    files: 80,
    progress: 38,
    next: "Quiz 1 → Quiz 2",
    topics: ["Probability", "Pattern Recognition", "Neural Nets", "CNN"],
    shelves: [
      { label: "Current", count: 1, note: "Course status" },
      { label: "Study aids", count: 3, note: "Historical" },
      { label: "Quiz", count: 4, note: "Two-stage prep" },
      { label: "Exams", count: 7, note: "EE6497 + IE4497" },
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

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [view, setView] = useState<"grid" | "focus">("grid");

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
        <div className="profile" title="Private circle">
          <span className="status-dot" />
          <span className="profile-copy"><strong>Study circle</strong><small>Private · 1 member</small></span>
          <span className="avatar">Y</span>
        </div>
      </header>

      <section className="hero shell" id="top">
        <div className="eyebrow"><span>AY 2026–27</span><i />SEMESTER 1</div>
        <div className="hero-grid">
          <div>
            <h1>把复杂的知识，<br /><em>收进一座岛。</em></h1>
            <p>你的私人课程资料馆。让讲义、测验、往年试卷与学习路径各归其位，也让同行的人随时找到方向。</p>
          </div>
          <div className="orbit-card" aria-label="Library overview">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="planet"><span>4</span><small>COURSES</small></div>
            <span className="satellite satellite-a" />
            <span className="satellite satellite-b" />
            <span className="satellite satellite-c" />
            <div className="orbit-note"><strong>954</strong><span>indexed items</span></div>
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
              <div className="card-top"><span className="course-number">0{index + 1}</span><span className="file-count">{course.files} ITEMS</span></div>
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
          <p>首版先建立资料地图；下一步会接入已审核的 PDF 预览、下载和全文搜索。</p>
        </div>
        <div className="timeline">
          <div className="timeline-line" />
          <div className="timeline-item active"><span>01</span><div><small>NOW</small><strong>资料地图</strong><p>课程结构与分类已就位</p></div></div>
          <div className="timeline-item"><span>02</span><div><small>NEXT</small><strong>精选资料</strong><p>审核并接入讲义与试卷</p></div></div>
          <div className="timeline-item"><span>03</span><div><small>LATER</small><strong>全文搜索</strong><p>跨课程定位知识点</p></div></div>
        </div>
      </section>

      <footer className="shell" id="about"><span>知屿 · Course Atlas</span><p>Built for a small circle of curious minds.</p><small>PRIVATE LIBRARY · 2026</small></footer>

      {activeCourse && (
        <div className="modal-backdrop" onMouseDown={() => setActiveCourse(null)}>
          <section className="course-modal" onMouseDown={(event) => event.stopPropagation()} style={{ "--accent": activeCourse.accent, "--accent-soft": activeCourse.accentSoft } as React.CSSProperties}>
            <button className="close" onClick={() => setActiveCourse(null)} aria-label="Close">×</button>
            <span className="modal-kicker">{activeCourse.code} · COURSE MAP</span>
            <h2>{activeCourse.title}</h2>
            <p>{activeCourse.description}</p>
            <div className="modal-stat"><span><strong>{activeCourse.files}</strong><small>indexed items</small></span><span><strong>{activeCourse.progress}%</strong><small>mapped</small></span><span><strong>{activeCourse.next}</strong><small>study signal</small></span></div>
            <div className="shelf-grid">
              {activeCourse.shelves.map((shelf) => <button key={shelf.label}><span>{shelf.count}</span><strong>{shelf.label}</strong><small>{shelf.note}</small><ArrowIcon /></button>)}
            </div>
            <div className="notice"><SparkIcon /><span><strong>Front-end preview</strong>资料下载将在审核分享范围后接入。</span></div>
          </section>
        </div>
      )}
    </main>
  );
}
