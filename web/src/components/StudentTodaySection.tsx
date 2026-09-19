import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { usePublishedDay, type PublishedLearningBlock } from "../hooks/usePublishedDay";
import { useStudentProgress, updateBlockProgressFn } from "../hooks/useStudentProgress";
import { computeEligibleBlocks, type EligibilityInputBlock, type StudentBlockProgressState } from "../lib/blockEligibility";
import { subjectLabel } from "../lib/subjects";
import type { InstructionalStage } from "../hooks/useProposedDays";
import { AskForHelpWidget } from "./AskForHelpWidget";

const STAGE_LABEL: Record<InstructionalStage, string> = {
  warmup_retrieval: "Warm-up / retrieval",
  teach_model: "Teach / model",
  guided_practice: "Guided practice",
  independent_practice: "Independent practice",
  assessment_check: "Assessment / check",
  application_transfer: "Application / transfer",
  reflection_metacognition: "Reflection",
  enrichment: "Enrichment",
};

const ELIGIBILITY_REASON_LABEL: Record<string, string> = {
  already_completed: "Done!",
  teacher_locked: "Your teacher has this locked for now",
  prerequisite_incomplete: "Finish an earlier activity first",
  not_next_in_strict_order: "Come back to this after today's earlier activities",
  enrichment_locked_until_required_complete: "Unlocks once today's required work is done",
};

/**
 * The family's own local calendar date — NEVER `toISOString().slice(0,
 * 10)` (build-order step 11.1, section 3: "a student sees the school day
 * when its scheduled date arrives — never a day early"). `toISOString()`
 * reports UTC, so anywhere west of UTC (all US timezones) it silently
 * rolls over to tomorrow's date hours before local midnight — e.g. in
 * Central time (UTC-6), "today" would already read as tomorrow by 6pm.
 * Since a PublishedDay's own doc id is keyed by an exact date string, that
 * UTC/local mismatch would make a day appear a day EARLY, which is
 * exactly what this promise forbids. Built from local Date getters
 * instead, so it always matches the calendar day on the family's own
 * clock.
 */
function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The minimum useful governed Today experience for a family test
 * (build-order step 11, section 3) — Pledge cue, Jasper Morning Message,
 * agenda, LearningBlocks in approved order with eligibility/locked state,
 * per-block Ask for Help, and the Historical Figure Coloring closing.
 * Reads only `publishedDays` (never `proposedDays` — teacher-only
 * forever) and merges in this student's own live progress before
 * computing eligibility, since a block's plan-time completionState never
 * updates (see lib/blockEligibility.ts's doc comment).
 *
 * Deliberately NOT a scheduling engine or a redesigned page: this renders
 * nothing when there is no approved day for today, so it composes safely
 * above StudentHomePage's existing placement-test content rather than
 * replacing it.
 */
export function StudentTodaySection() {
  const { user, profile } = useAuth();
  const date = todayDateString();
  const { publishedDay, loading: dayLoading } = usePublishedDay(profile?.familyId, user?.uid, date);
  const { progress } = useStudentProgress(profile?.familyId, user?.uid, date);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (dayLoading) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
        Loading today...
      </p>
    );
  }

  if (!publishedDay) {
    return (
      <div
        className="rounded-xl border p-5 shadow-sm text-center"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Nothing approved for today yet. Check back after your teacher approves your day.
        </p>
      </div>
    );
  }

  const eligibilityInput: EligibilityInputBlock[] = publishedDay.learningBlocks.map((block) => ({
    blockId: block.blockId,
    required: block.required,
    order: block.order,
    dependsOn: block.dependsOn,
    teacherLocked: block.teacherLocked,
    completionState: (progress?.blocks[block.blockId]?.state ?? "not_started") as StudentBlockProgressState,
  }));
  const eligibility = computeEligibleBlocks(eligibilityInput, publishedDay.itineraryMode);
  const eligibilityByBlockId = new Map(eligibility.map((e) => [e.blockId, e]));
  const orderedBlocks = [...publishedDay.learningBlocks].sort((a, b) => a.order - b.order);
  const hasRequiredMovement = publishedDay.learningBlocks.some((b) => b.subject === "physical_education");

  async function setBlockState(block: PublishedLearningBlock, state: StudentBlockProgressState) {
    if (!user || !publishedDay || !publishedDay.proposedDayId) return;
    setPendingBlockId(block.blockId);
    setActionError(null);
    try {
      await updateBlockProgressFn({
        studentId: user.uid,
        proposedDayId: publishedDay.proposedDayId,
        blockId: block.blockId,
        state,
      });
    } catch {
      setActionError("Couldn't save that. Try again.");
    } finally {
      setPendingBlockId(null);
    }
  }

  return (
    <div className="text-left space-y-4">
      <div
        className="rounded-xl border p-5 shadow-sm text-center space-y-1"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          🇺🇸 Start today with the Pledge of Allegiance
        </p>
      </div>

      {publishedDay.jasperMessage && (
        <div
          className="rounded-xl border p-5 shadow-sm space-y-1"
          style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
        >
          <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            🐴 Jasper says
          </p>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            {publishedDay.jasperMessage}
          </p>
        </div>
      )}

      <div
        className="rounded-xl border p-5 shadow-sm space-y-2"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {publishedDay.title}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {publishedDay.summary}
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {publishedDay.itineraryMode === "strict"
            ? "Today's order: do these in order, top to bottom."
            : "Today's order: flexible — pick any unlocked activity below."}
          {hasRequiredMovement && " Don't forget your movement/PE time today!"}
        </p>
      </div>

      {actionError && (
        <p className="text-sm" style={{ color: "var(--status-critical)" }}>
          {actionError}
        </p>
      )}

      <div className="space-y-3">
        {orderedBlocks.map((block) => {
          const state = progress?.blocks[block.blockId]?.state ?? "not_started";
          const elig = eligibilityByBlockId.get(block.blockId);
          const eligible = elig?.eligible ?? false;
          const isCompleted = state === "completed";
          const isPending = pendingBlockId === block.blockId;

          return (
            <div
              key={block.blockId}
              className="rounded-xl border p-4 shadow-sm space-y-2"
              style={{ background: "var(--surface-1)", borderColor: "var(--border)", opacity: eligible || isCompleted ? 1 : 0.7 }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {block.title}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {subjectLabel(block.subject)} · {STAGE_LABEL[block.stage]} · ~{block.estimatedMinutes} min
                    {!block.required && " · Enrichment"}
                  </p>
                </div>
                {isCompleted && (
                  <span className="text-xs font-medium" style={{ color: "var(--status-good)" }}>
                    ✅ Done
                  </span>
                )}
              </div>

              {block.notes && (
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {block.notes}
                </p>
              )}

              {block.carriedForward && (
                <p className="text-xs italic" style={{ color: "var(--text-secondary)" }}>
                  Carried forward from a previous day{block.carryForwardReason ? `: ${block.carryForwardReason}` : "."}
                </p>
              )}

              {!eligible && !isCompleted && elig && (
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  🔒 {ELIGIBILITY_REASON_LABEL[elig.reason] ?? elig.reason}
                </p>
              )}

              {eligible && !isCompleted && (
                <div className="flex gap-2">
                  {state !== "in_progress" && (
                    <button
                      disabled={isPending}
                      onClick={() => setBlockState(block, "in_progress")}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                    >
                      Start
                    </button>
                  )}
                  <button
                    disabled={isPending}
                    onClick={() => setBlockState(block, "completed")}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    style={{ background: "var(--series-1)" }}
                  >
                    Mark done
                  </button>
                </div>
              )}

              {(eligible || isCompleted) && (
                <AskForHelpWidget
                  compact
                  reference={{ proposedDayId: publishedDay.proposedDayId ?? undefined, blockId: block.blockId }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div
        className="rounded-xl border p-5 shadow-sm space-y-2"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          🎨 Historical Figure Coloring
        </h2>
        {!publishedDay.historicalFigureClosing && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No Historical Figure Coloring closing planned for today.
          </p>
        )}
        {publishedDay.historicalFigureClosing && (
          <div className="space-y-2">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {publishedDay.historicalFigureClosing.name} — {publishedDay.historicalFigureClosing.era}
            </p>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {publishedDay.historicalFigureClosing.briefBio}
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {publishedDay.historicalFigureClosing.whyItMatters}
            </p>
            {publishedDay.historicalFigureClosing.artworkAvailable ? (
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                Ask your teacher for today's printable coloring page.
              </p>
            ) : (
              <p className="text-sm italic" style={{ color: "var(--text-secondary)" }}>
                No printable coloring page is ready for this figure yet — that's okay! You can still
                do the show-and-tell below.
              </p>
            )}
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              💬 {publishedDay.historicalFigureClosing.showAndTellPrompt}
            </p>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              🤔 {publishedDay.historicalFigureClosing.recallQuestion}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
