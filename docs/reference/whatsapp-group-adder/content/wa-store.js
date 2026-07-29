// wa-store.js — runs in the PAGE's MAIN world (see manifest "world": "MAIN").
// WhatsApp Web uses Meta's Haste module system exposed as a global require(name),
// NOT webpack chunk extraction. We resolve the internal modules we need by name
// (discovered via console probing on a live client):
//
//   WAWebWidFactory              → createWid()  (build group / user WIDs)
//   WAWebGroupModifyParticipantsJob → addGroupParticipants()  (the add call)
//   WAWebChatCollection          → ChatCollection.getModelsArray() (list groups)
//   WAWebUserPrefsMeUser         → getMaybeMePnUser/getMaybeMeLidUser (admin check)
//
// Groups are chats whose id.server === "g.us". Participant ids may be "@lid"
// (hidden-phone) while "me" is "@c.us", so admin matching checks both me-wids.
//
// Exposed over window.postMessage: PROBE / LIST_GROUPS / ADD / DUMP.

(function () {
  const TAG = "[WAGA-store]";
  let store = null;

  function rq(name) {
    try {
      const r = window.require || self.require;
      return typeof r === "function" ? r(name) : null;
    } catch (_) {
      return null;
    }
  }

  function getStore() {
    if (store) return store;
    const WF = rq("WAWebWidFactory");
    const GMP = rq("WAWebGroupModifyParticipantsJob");
    const CCm = rq("WAWebChatCollection") || {};
    const Chat = CCm.ChatCollection || CCm.ChatCollectionImpl;
    const ME = rq("WAWebUserPrefsMeUser");
    if (!WF || !WF.createWid || !Chat || !Chat.getModelsArray) return null;
    store = { WF, GMP, Chat, ME };
    return store;
  }

  function serial(w) {
    if (!w) return "";
    if (w._serialized) return w._serialized;
    try {
      return String(w);
    } catch (_) {
      return "";
    }
  }
  function tryCall(obj, method) {
    try {
      return obj && typeof obj[method] === "function" ? obj[method]() : null;
    } catch (_) {
      return null;
    }
  }

  function meWids(s) {
    const pn = tryCall(s.ME, "getMaybeMePnUser");
    const lid = tryCall(s.ME, "getMaybeMeLidUser");
    return [pn, lid].filter(Boolean).map(serial);
  }

  // ---- capabilities --------------------------------------------------------
  function listGroups() {
    const s = getStore();
    const arr = s.Chat.getModelsArray();
    const mine = meWids(s);
    const out = [];
    for (const c of arr) {
      if (!(c && c.id && c.id.server === "g.us")) continue;
      let admin = true; // lenient default; WhatsApp still enforces server-side
      let size = null;
      try {
        const meta = c.groupMetadata;
        const parts = meta && meta.participants;
        if (parts && parts.getModelsArray) {
          const pa = parts.getModelsArray();
          size = pa.length;
          if (mine.length) {
            const meP = pa.find((p) => mine.indexOf(serial(p.id)) > -1);
            if (meP) admin = !!(meP.isAdmin || meP.isSuperAdmin);
          }
        }
      } catch (_) {}
      out.push({ id: serial(c.id), name: c.formattedTitle || c.name || serial(c.id), size, admin });
    }
    // Groups where you're admin first, then by name.
    out.sort((a, b) => (a.admin === b.admin ? String(a.name).localeCompare(String(b.name)) : a.admin ? -1 : 1));
    return out;
  }

  function groupMeta(s, groupId) {
    try {
      const c = s.Chat.get ? s.Chat.get(groupId) : null;
      return c && c.groupMetadata ? c.groupMetadata : null;
    } catch (_) {
      return null;
    }
  }

  // Confirmed signature (WhatsApp build 2026-07): each participant is an OBJECT
  // { phoneNumber: <userWid> }. Returns:
  //   { status, participants: [{ userWid, code, subCode }], invitedOutContacts }
  // participant.code "200" = added; a non-empty invitedOutContacts (or code 403)
  // means privacy blocked the direct add → the person must be invited instead.
  async function addParticipant(groupId, phone) {
    const s = getStore();
    if (!s || !s.GMP || typeof s.GMP.addGroupParticipants !== "function") return { code: "no-api" };
    const groupWid = s.WF.createWid(groupId);
    const userWid = s.WF.createWid(phone + "@c.us");
    try {
      const res = await s.GMP.addGroupParticipants(groupWid, [{ phoneNumber: userWid }]);
      console.log(TAG, "add raw:", res);
      return { code: extractCode(res), raw: safe(res) };
    } catch (e) {
      console.warn(TAG, "add failed:", e && e.message);
      return { code: "error", error: String((e && e.message) || e) };
    }
  }

  // Reduce the multi-status result to a single code our classifier understands.
  function extractCode(res) {
    try {
      if (!res) return "unknown";
      // Privacy-blocked → WhatsApp routes them to invitedOutContacts.
      if (Array.isArray(res.invitedOutContacts) && res.invitedOutContacts.length) return "403";
      const parts = res.participants || res.added || [];
      if (Array.isArray(parts) && parts.length) {
        const p = parts[0];
        const code = p.code ?? p.status ?? p.result;
        return code == null ? "unknown" : String(code);
      }
      // No participants echoed but no invite either — treat status as the signal.
      if (res.status != null) return String(res.status);
      return "unknown";
    } catch (_) {
      return "unknown";
    }
  }

  function safe(v) {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch (_) {
      return String(v);
    }
  }

  function report() {
    const s = getStore();
    return {
      available: !!s,
      canAdd: !!(s && s.GMP && typeof s.GMP.addGroupParticipants === "function"),
      hasMe: !!(s && s.ME),
    };
  }

  // ---- postMessage bridge --------------------------------------------------
  window.addEventListener("message", async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__waga !== "req") return;
    const reply = (payload) => window.postMessage({ __waga: "res", id: d.id, payload }, "*");

    try {
      if (d.action === "PROBE") return reply(report());
      const s = getStore();
      if (!s) return reply({ available: false });
      if (d.action === "LIST_GROUPS") return reply({ available: true, groups: listGroups() });
      if (d.action === "ADD") {
        const r = await addParticipant(d.groupId, d.phone);
        return reply({ available: true, ...r });
      }
      if (d.action === "DUMP") return reply({ available: true, report: report() });
      reply({ available: false, error: "unknown action" });
    } catch (e) {
      reply({ available: false, error: String((e && e.message) || e) });
    }
  });

  // Log readiness a few seconds after load (require may not be ready at idle).
  setTimeout(() => {
    try {
      console.log(TAG, "readiness:", report());
    } catch (_) {}
  }, 5000);

  console.log(TAG, "bridge installed (require-based)");
})();
