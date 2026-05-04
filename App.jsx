import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Upload, FileVideo, PlayCircle, Settings, Clipboard, Download,
  FileCode, MessageSquare, Lightbulb, Loader2, RefreshCw,
  Edit2, Check, X, ChevronDown, FileText, File
} from 'lucide-react';
// import './App.css'; // 已在 index.html 中載入，在瀏覽器環境中註解掉避免報錯

const API_KEY_DEFAULT = "";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

const FIXED_FORMAT_PROMPT = `
【輸出格式】
你必須僅回傳一個合法的 JSON 物件，不要包含任何 Markdown 標籤（如 \`\`\`json）。
JSON 必須符合以下結構：
{
  "author": "字串，撰稿人名稱 (若影片無提及，請根據角色假設或填寫 '自動化生成SOP系統')",
  "introduction": "字串，一兩句話說明此 SOP 的作用與目的",
  "process_name": "字串，SOP 標題",
  "trigger": "字串，起始條件",
  "parts": [
    {
      "part_title": "字串，段落標題，例如 '【第一部分】事前準備'",
      "steps": [
        {
          "step_title": "字串，步驟標題，例如 '步驟1：建立一個新的儲存庫'",
          "timestamp": "數字，影片開始的秒數 (請只給數字，不要加上 's')",
          "description": "字串，步驟的簡單說明 (可為空)",
          "actions": [
            "字串，具體操作動作，例如 '1. 登入GitHub...'",
            "字串，另一個操作動作"
          ]
        }
      ]
    }
  ]
}
`;

const SAMPLE_PROMPT = `你是一位精通操作手冊撰寫專家。請觀察影片內容並撰寫詳細 SOP。
撰稿人：XXX
【防幻覺規則】
1. 僅紀錄影片中實際發生的動作與檔案名稱（如採購單號、Excel 檔名）。
2. 如果影片內容不符，嚴禁胡謅。
3. 使用台灣地區常用正體中文與術語（軟體、儲存、設定、檔案、網路）。
4. 輸出文字若包含引號，請務必改用「單引號」或「全形引號」，嚴禁使用半形雙引號 (") 以免破壞 JSON 結構。`;

const App = () => {
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState(DEFAULT_MODEL);
  const [availableModels, setAvailableModels] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [file, setFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, uploading, processing, generating, completed, error
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // 影片控制參照
  const videoRef = useRef(null);

  // 編輯狀態
  const [editingPos, setEditingPos] = useState({ partIndex: null, stepIndex: null });
  const [editForm, setEditForm] = useState({ step_title: '', description: '', actions: '' });

  const fillSamplePrompt = () => setUserPrompt(SAMPLE_PROMPT);

  // --- 匯出功能模組 ---
  const copyToClipboard = (text, type = "純文字") => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`已複製 ${type} 到剪貼簿！`);
    }).catch(err => {
      console.error('複製失敗:', err);
      alert('複製失敗，請手動複製。');
    });
  };

  const generateMarkdown = (data) => {
    if (!data || !data.parts) return "尚無數據可生成 Markdown。";
    let md = `# ${data.process_name || '標準作業程序 (SOP)'}\n\n`;
    md += `**撰稿人**：${data.author || '未指定'}\n\n`;
    if (data.introduction) md += `${data.introduction}\n\n`;
    md += `> **觸發條件**：${data.trigger || '未指定'}\n>\n`;
    md += `> **生成時間**：${new Date().toLocaleString('zh-TW')}\n\n`;

    data.parts.forEach(part => {
      md += `## ${part.part_title}\n\n`;
      part.steps.forEach(step => {
        const ts = formatTime(step.timestamp);
        md += `### ${step.step_title} (🕒 ${ts})\n\n`;
        if (step.description) md += `${step.description}\n\n`;
        if (step.actions && step.actions.length > 0) {
          step.actions.forEach(action => {
            md += `- ${action}\n`;
          });
          md += `\n`;
        }
      });
    });

    md += `---\n*本文件由 AI 錄影轉 SOP 系統自動生成*`;
    return md;
  };

  const generatePlainText = (data) => {
    if (!data || !data.parts) return "";
    let text = `【${data.process_name}】\n`;
    text += `撰稿人：${data.author || '未指定'}\n\n`;
    if (data.introduction) text += `${data.introduction}\n\n`;
    text += `觸發條件：${data.trigger || '未指定'}\n\n`;

    data.parts.forEach(part => {
      text += `${part.part_title}\n`;
      part.steps.forEach(step => {
        const ts = formatTime(step.timestamp);
        text += `${step.step_title} [${ts}]\n`;
        if (step.description) text += `${step.description}\n`;
        if (step.actions && step.actions.length > 0) {
          step.actions.forEach(action => {
            text += `${action}\n`;
          });
        }
        text += `\n`;
      });
    });
    return text;
  };

  const downloadMarkdown = () => {
    const content = generateMarkdown(result);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result?.process_name || 'SOP_Export'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds) => {
    const s = parseInt(seconds, 10);
    if (isNaN(s)) return seconds;
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins === 0) return `${secs}秒`;
    return `${mins}分${secs.toString().padStart(2, '0')}秒`;
  };

  const downloadPDF = () => {
    // 呼叫瀏覽器原生的列印功能（可選擇儲存為 PDF）
    window.print();
  };

  // --- 影片跳轉功能 ---
  const handleSeek = (timestamp) => {
    if (videoRef.current) {
      const time = parseFloat(timestamp);
      if (!isNaN(time)) {
        videoRef.current.currentTime = time;
        videoRef.current.play();
      }
    }
  };

  // --- 內聯編輯功能 ---
  const startEdit = (e, partIndex, stepIndex, step) => {
    e.stopPropagation(); // 避免觸發跳轉
    setEditingPos({ partIndex, stepIndex });
    setEditForm({
      step_title: step.step_title || '',
      description: step.description || '',
      actions: step.actions ? step.actions.join('\n') : ''
    });
  };

  const saveEdit = (e, partIndex, stepIndex) => {
    e.stopPropagation();
    const newResult = { ...result };
    const targetStep = newResult.parts[partIndex].steps[stepIndex];
    targetStep.step_title = editForm.step_title;
    targetStep.description = editForm.description;
    targetStep.actions = editForm.actions.split('\n').filter(a => a.trim() !== '');
    setResult(newResult);
    setEditingPos({ partIndex: null, stepIndex: null });
  };

  const cancelEdit = (e) => {
    e.stopPropagation();
    setEditingPos({ partIndex: null, stepIndex: null });
  };

  // --- API 邏輯 ---
  const detectModels = useCallback(async () => {
    const key = apiKey || API_KEY_DEFAULT;
    if (!key) {
      setErrorMessage("請先輸入 API Key 才能偵測模型。");
      return;
    }
    setIsDetecting(true);
    try {
      const response = await fetch(`${BASE_URL}/models?key=${key}`);
      const data = await response.json();
      if (data.models) {
        const models = data.models
          .filter(m => m.supportedGenerationMethods.includes("generateContent"))
          .map(m => m.name.replace("models/", ""));
        setAvailableModels(models);
        if (!models.includes(modelName)) {
          const fallback = models.find(m => m.includes("flash")) || models[0];
          setModelName(fallback);
        }
      } else if (data.error) {
        throw new Error(data.error.message);
      }
    } catch (err) {
      setErrorMessage(`偵測模型失敗: ${err.message}`);
    } finally {
      setIsDetecting(false);
    }
  }, [apiKey, modelName]);

  const fetchWithRetry = async (url, options, retries = 5) => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        const data = await res.json();
        if (res.ok) return data;
        if ([429, 503, 500].includes(res.status) && i < retries - 1) {
          const delay = Math.pow(2, i) * 1000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw { status: res.status, data };
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      }
    }
  };

  const processFile = (selectedFile) => {
    if (!selectedFile) return;

    // 嚴格限制僅限 mp4
    if (selectedFile.type === 'video/mp4' || selectedFile.name.toLowerCase().endsWith('.mp4')) {
      setFile(selectedFile);
      setVideoPreview(URL.createObjectURL(selectedFile));
      setStatus('idle');
      setResult(null);
      setErrorMessage("");
    } else {
      setErrorMessage("為了確保完美的影片時間軸連動體驗，請務必上傳 .mp4 格式的視訊檔案。");
    }
  };

  const handleFileChange = (e) => {
    processFile(e.target.files[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const startWorkflow = async () => {
    if (!file) return;
    const currentKey = apiKey || API_KEY_DEFAULT;
    const finalPrompt = `${userPrompt.trim() || SAMPLE_PROMPT}\n\n${FIXED_FORMAT_PROMPT}`;

    setStatus('uploading');
    setErrorMessage("");
    setProgress(10);

    try {
      const metadata = { file: { display_name: file.name } };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', file);

      const uploadData = await fetchWithRetry(`${UPLOAD_URL}/files?key=${currentKey}`, {
        method: 'POST',
        headers: { 'X-Goog-Upload-Protocol': 'multipart' },
        body: formData
      });

      const fileUri = uploadData.file.uri;
      const fileName = uploadData.file.name;

      setStatus('processing');
      let attempts = 0;
      while (attempts < 60) {
        const s = await fetch(`${BASE_URL}/${fileName}?key=${currentKey}`).then(r => r.json());
        if (s.state === 'ACTIVE') break;
        else if (s.state === 'FAILED') throw new Error("視訊解析失敗，請確認檔案。");
        await new Promise(r => setTimeout(r, 4000));
        attempts++;
        setProgress(Math.min(55, 30 + attempts * 0.5));
      }

      setStatus('generating');
      setProgress(60);

      const payload = {
        contents: [{
          parts: [
            { fileData: { mimeType: file.type || "video/mp4", fileUri: fileUri } },
            { text: "請分析此視訊內容並產出 SOP JSON。請精確對照視訊中的畫面動作與發生時間。" },
          ]
        }],
        systemInstruction: { parts: [{ text: finalPrompt }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
      };

      const genData = await fetchWithRetry(`${BASE_URL}/models/${modelName}:generateContent?key=${currentKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let txt = genData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (txt) {
        try {
          // 移除可能存在的 markdown json 標籤
          txt = txt.replace(/^```json\n?/g, '').replace(/```$/g, '').trim();
          setResult(JSON.parse(txt));
          setStatus('completed');
          setProgress(100);
        } catch (parseError) {
          console.error("JSON 解析失敗，原始文字：", txt);
          throw new Error("AI 產生的格式發生衝突（可能是引號未正確跳脫），請重新點擊「開始自動生成」再試一次。");
        }
      } else {
        throw new Error("模型無回應內容。");
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.data?.error?.message || err.message || "分析過程中發生錯誤");
    }
  };

  return (
    <div>
      <header className="glass-header">
        <div className="header-title">
          <div className="icon-box"><FileVideo size={24} /></div>
          SOP Auto-Gen Studio
        </div>
        <div className="controls-row">
          <input
            type="password"
            placeholder="輸入Google Gemini API Key"
            className="input-modern"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button onClick={detectModels} title="偵測可用AI模型" className="icon-box" style={{ background: 'white', color: '#64748b', border: '1px solid #cbd5e1', cursor: 'pointer' }}>
            <RefreshCw size={16} className={isDetecting ? 'spin' : ''} />
          </button>
          <select
            className="select-modern"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
          >
            {availableModels.length > 0 ? (
              availableModels.map(m => <option key={m} value={m}>{m}</option>)
            ) : (
              <option value={DEFAULT_MODEL}>{DEFAULT_MODEL} (預設)</option>
            )}
          </select>
        </div>
      </header>

      <main className="main-layout">
        {/* 左側控制面板與影片區 */}
        <div className="left-panel">
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div className="section-title">
              <MessageSquare size={20} color="var(--primary)" />
              SOP 分析指令 (Prompt)
              <button
                onClick={fillSamplePrompt}
                style={{ marginLeft: 'auto', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Lightbulb size={14} /> 填入範例
              </button>
            </div>
            <textarea
              className="prompt-textarea"
              placeholder="請輸入 AI 分析規則，例如：請特別紀錄點擊報價單的步驟..."
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
            />
          </div>

          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div className="section-title">
              <Upload size={20} color="var(--primary)" />
              上傳影片 (僅限 .mp4)
            </div>

            <label
              className={`upload-zone ${file || isDragging ? 'active' : ''}`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input type="file" className="hidden" accept=".mp4,video/mp4" onChange={handleFileChange} style={{ display: 'none' }} />
              {file ? (
                <>
                  <FileVideo size={32} color="var(--primary)" style={{ marginBottom: '12px' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', wordBreak: 'break-all' }}>{file.name}</p>
                </>
              ) : (
                <>
                  <PlayCircle size={40} color="#cbd5e1" style={{ marginBottom: '12px' }} />
                  <p style={{ margin: 0, fontWeight: 700, color: '#64748b' }}>點擊或拖放上傳 MP4</p>
                </>
              )}
            </label>

            {videoPreview && (
              <div className="video-container fade-in-up">
                <video ref={videoRef} src={videoPreview} controls />
              </div>
            )}

            <button
              onClick={startWorkflow}
              disabled={!file || status === 'uploading'}
              className="btn-primary"
              style={{ marginTop: '1.5rem' }}
            >
              {status === 'idle' || status === 'completed' || status === 'error' ? '開始自動生成 SOP' : <><Loader2 className="spin" /> 處理中...</>}
            </button>

            {(status !== 'idle' && status !== 'error') && (
              <div className="progress-container fade-in-up">
                <div className="progress-header">
                  <span>處理狀態: {status}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="fade-in-up" style={{ marginTop: '1.5rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>
                {errorMessage}
              </div>
            )}
          </div>
        </div>

        {/* 右側結果展示區 */}
        <div className="right-panel">
          <div className="glass-panel" style={{ padding: '2.5rem', minHeight: '100%' }}>
            {result ? (
              <div className="fade-in-up" id="sop-report-content">
                <div className="result-header">
                  <div className="export-menu-container">
                    <button className="btn-export">
                      <Download size={16} /> 匯出選項 <ChevronDown size={14} />
                    </button>
                    <div className="export-dropdown">
                      <button className="export-item" onClick={downloadPDF}>
                        <FileVideo size={16} /> 輸出 PDF 報告
                      </button>
                      <button className="export-item" onClick={downloadMarkdown}>
                        <FileText size={16} /> 下載 Markdown (.md)
                      </button>
                      <button className="export-item" onClick={() => copyToClipboard(generateMarkdown(result), 'Markdown')}>
                        <Clipboard size={16} /> 複製 Markdown 語法
                      </button>
                      <button className="export-item" onClick={() => copyToClipboard(generatePlainText(result), '純文字')}>
                        <File size={16} /> 複製純文字
                      </button>
                      <button className="export-item" onClick={() => copyToClipboard(JSON.stringify(result, null, 2), 'JSON')}>
                        <FileCode size={16} /> 複製原始 JSON
                      </button>
                    </div>
                  </div>
                </div>

                <div className="sop-hero">
                  <h3 className="sop-title">{result.process_name}</h3>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem', fontWeight: '600' }}>
                    撰稿人：{result.author}
                  </div>
                  {result.introduction && (
                    <div style={{ color: 'var(--text-main)', fontSize: '1rem', marginBottom: '1.5rem', lineHeight: '1.6', background: '#f8fafc', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
                      {result.introduction}
                    </div>
                  )}
                  <div className="sop-trigger">
                    <span style={{ fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>啟動條件</span>
                    <strong>{result.trigger}</strong>
                  </div>
                </div>

                <div className="timeline">
                  {result.parts && result.parts.map((part, pIndex) => (
                    <div key={pIndex} className="part-section" style={{ marginBottom: '2.5rem' }}>
                      <h3 style={{ fontSize: '1.25rem', color: 'var(--primary)', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem', fontWeight: 'bold' }}>
                        {part.part_title}
                      </h3>
                      {part.steps && part.steps.map((step, sIndex) => {
                        const isEditing = editingPos.partIndex === pIndex && editingPos.stepIndex === sIndex;
                        return (
                          <div key={sIndex} className="step-card-wrapper fade-in-up" style={{ animationDelay: `${sIndex * 0.1}s` }}>
                            <div className="step-number" style={{ background: 'var(--primary)', color: 'white' }}>{sIndex + 1}</div>

                            <div
                              className="step-card"
                              onClick={() => !isEditing && handleSeek(step.timestamp)}
                              style={{ cursor: isEditing ? 'default' : 'pointer' }}
                            >
                              {isEditing ? (
                                <div className="edit-form" onClick={e => e.stopPropagation()}>
                                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>步驟標題</label>
                                  <input
                                    type="text"
                                    className="edit-input"
                                    value={editForm.step_title}
                                    onChange={e => setEditForm({ ...editForm, step_title: e.target.value })}
                                  />

                                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>步驟說明 (選填)</label>
                                  <input
                                    type="text"
                                    className="edit-input"
                                    value={editForm.description}
                                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                  />

                                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>具體操作動作 (每行一個動作)</label>
                                  <textarea
                                    className="edit-input"
                                    style={{ minHeight: '100px', resize: 'vertical' }}
                                    value={editForm.actions}
                                    onChange={e => setEditForm({ ...editForm, actions: e.target.value })}
                                  />

                                  <div className="edit-actions">
                                    <button className="btn-small btn-cancel" onClick={cancelEdit}><X size={14} /> 取消</button>
                                    <button className="btn-small btn-save" onClick={(e) => saveEdit(e, pIndex, sIndex)}><Check size={14} /> 儲存</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button className="btn-edit-trigger" onClick={(e) => startEdit(e, pIndex, sIndex, step)} title="編輯此步驟">
                                    <Edit2 size={16} />
                                  </button>
                                  <div className="step-header" style={{ marginBottom: '0.5rem' }}>
                                    <span className="badge-time">
                                      <PlayCircle size={14} /> {formatTime(step.timestamp)}
                                    </span>
                                  </div>
                                  <h4 className="step-instruction" style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>{step.step_title}</h4>
                                  {step.description && (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1rem', lineHeight: '1.5' }}>{step.description}</p>
                                  )}
                                  {step.actions && step.actions.length > 0 && (
                                    <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: '1.6' }}>
                                      {step.actions.map((action, aIndex) => (
                                        <li key={aIndex} style={{ marginBottom: '0.25rem' }}>{action}</li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state fade-in-up">
                <div className="empty-icon">
                  <FileText size={32} color="#cbd5e1" />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 8px 0' }}>尚無分析資料</h3>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>請於左側設定指令並上傳影片<br />SOP 自動生成後將顯示於此，點擊步驟即可連動影片播放</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>
        這個網頁開發屬於臺灣港務股份有限公司資訊處
      </footer>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        
        /* 列印/PDF 匯出專用樣式 */
        @media print {
          /* 強制保留背景顏色與漸層 */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          body {
            background: white !important;
            color: black;
          }

          /* 隱藏不需要的 UI 元素 */
          .glass-header, 
          .left-panel, 
          footer, 
          .export-menu-container, 
          .btn-edit-trigger, 
          .edit-form,
          .empty-state {
            display: none !important;
          }

          /* 重置佈局以適應紙張 */
          .main-layout {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          
          .right-panel {
            width: 100% !important;
          }

          .glass-panel {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
          }

          /* 確保卡片不會被跨頁切斷 */
          .step-card-wrapper {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 24px !important;
          }
          
          .part-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* 美化列印卡片 */
          .step-card {
            box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important;
            border: 1px solid #e2e8f0 !important;
          }
          
          .sop-hero {
            box-shadow: none !important;
            border-radius: 16px !important;
            padding: 2rem !important;
            margin-bottom: 2rem !important;
          }
        }
      `}</style>
    </div>
  );
};

// --- 啟動應用程式 ---
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
