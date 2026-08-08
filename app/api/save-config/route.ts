// POST /api/save-config — validates and persists the user's
// commit configuration (target repo, file, timezone, schedule slots).
import { getUserByRequest, publicUser, saveUser, type ScheduleSlot } from "@/lib/auth";
import { CORS_HEADERS, handleCors, json } from "@/lib/http";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NAME_RE = /^[A-Za-z0-9_.-]+$/;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const user = await getUserByRequest(request);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const owner = String(body.owner ?? "").trim();
  const repo = String(body.repo ?? "").trim();
  const targetFile = String(body.targetFile ?? "PROGRESS_LOG.md").trim().replace(/^\/+/, "");
  const timezone = String(body.timezone ?? user.timezone ?? "Asia/Kolkata");

  if (!NAME_RE.test(owner)) return json({ error: "Invalid owner name" }, 400);
  if (!NAME_RE.test(repo)) return json({ error: "Invalid repository name" }, 400);
  if (!targetFile || targetFile.length > 200) return json({ error: "Invalid target file path" }, 400);
  if (!isValidTimezone(timezone)) return json({ error: "Invalid timezone" }, 400);

  // Slots: validate each { time: "HH:MM", count: 1..10 }.
  // Preserve lastRun for slots whose time is unchanged, so saving the config
  // never re-arms an already-fired slot (prevents same-day duplicate bursts).
  let slots: ScheduleSlot[] = [];
  if (Array.isArray(body.slots)) {
    const prevByTime = new Map<string, string | null>(
      (user.slots ?? []).map((s) => [s.time, s.lastRun])
    );
    for (const s of body.slots) {
      if (!s || typeof s.time !== "string" || !TIME_RE.test(s.time)) {
        return json({ error: `Invalid slot time: ${s?.time}` }, 400);
      }
      const count = Number(s.count);
      if (!Number.isInteger(count) || count < 1 || count > 10) {
        return json({ error: `Slot count must be 1-10: ${s?.time}` }, 400);
      }
      slots.push({
        time: s.time,
        count,
        lastRun: prevByTime.get(s.time) ?? null,
      });
    }
  } else {
    return json({ error: "slots must be an array" }, 400);
  }

  const updated = {
    ...user,
    owner,
    repo,
    targetFile,
    timezone,
    slots,
    updatedAt: new Date().toISOString(),
  };

  await saveUser(updated);

  return json({ success: true, user: publicUser(updated) });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
