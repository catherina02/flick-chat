import { useState } from "react";
import { createApproval, createPoll, scheduleMessage } from "../api";

type ChatToolsModalProps = {
  conversationId: number;
  onClose: () => void;
  onCreated: () => void;
};

export default function ChatToolsModal({ conversationId, onClose, onCreated }: ChatToolsModalProps) {
  const [tab, setTab] = useState<"poll" | "approval" | "schedule">("poll");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("Yes\nNo");
  const [approvalTitle, setApprovalTitle] = useState("");
  const [scheduleBody, setScheduleBody] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      if (tab === "poll") {
        await createPoll(
          conversationId,
          question.trim(),
          options.split("\n").map((o) => o.trim()).filter(Boolean),
        );
      } else if (tab === "approval") {
        await createApproval(conversationId, approvalTitle.trim());
      } else {
        await scheduleMessage(conversationId, scheduleBody.trim(), new Date(scheduleAt).toISOString());
      }
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="side-panel-overlay" onClick={onClose}>
      <div className="tools-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3>Chat tools</h3>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
        <div className="tools-tabs">
          <button type="button" className={tab === "poll" ? "active" : ""} onClick={() => setTab("poll")}>Poll</button>
          <button type="button" className={tab === "approval" ? "active" : ""} onClick={() => setTab("approval")}>Approval</button>
          <button type="button" className={tab === "schedule" ? "active" : ""} onClick={() => setTab("schedule")}>Schedule</button>
        </div>

        {tab === "poll" ? (
          <>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Poll question" />
            <textarea value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Options (one per line)" rows={4} />
          </>
        ) : null}

        {tab === "approval" ? (
          <input value={approvalTitle} onChange={(e) => setApprovalTitle(e.target.value)} placeholder="Approval title" />
        ) : null}

        {tab === "schedule" ? (
          <>
            <textarea value={scheduleBody} onChange={(e) => setScheduleBody(e.target.value)} placeholder="Message to send later" rows={3} />
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </>
        ) : null}

        <button type="button" className="btn" disabled={loading} onClick={submit}>
          {loading ? "Saving..." : "Create"}
        </button>
      </div>
    </div>
  );
}
