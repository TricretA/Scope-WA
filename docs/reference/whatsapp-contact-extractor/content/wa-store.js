// wa-store.js — runs in the PAGE's MAIN world (see manifest "world": "MAIN").
// It reads WhatsApp Web's internal Store to enumerate groups and their members.
// READ-ONLY: it never adds, removes, or messages anyone.
//
// Exposes over window.postMessage:
//   • PROBE        → diagnostics: which internals were found
//   • LIST_GROUPS  → groups you're in (with admin flag + member count)
//   • EXTRACT      → participant list for one group (numbers + names + roles)
//   • DUMP         → verbose module diagnostics
//
// Modern WhatsApp Web ("Comet" webpack) exposes modules by string name via a
// global `window.require(name)` — e.g. window.require("WAWebChatCollection").
// Collections: WAWebChatCollection.ChatCollection, WAWebContactCollection
// .ContactCollection, WAWebGroupMetadataCollection.GroupMetadataCollection.
// Names change over time, so every lookup has a scan-based fallback.

(function () {
  const TAG = "[WACE-store]";
  let store = null;      // { Chat, Contact, GroupMetadata, getMe }
  let webpackReq = null; // captured __webpack_require__ (resolves modules by id)
  let report = null;

  // ---- low-level module access --------------------------------------------

  // A `require(name)` that works even if window.require is absent, by capturing
  // the real webpack require from a pushed chunk. Returns null on failure.
  function getModule(name) {
    if (typeof window.require === "function") {
      try {
        const m = window.require(name);
        if (m) return m;
      } catch (_) {}
    }
    if (webpackReq) {
      try {
        const m = webpackReq(name);
        if (m) return m;
      } catch (_) {}
    }
    return null;
  }

  function captureWebpackRequire() {
    if (webpackReq) return webpackReq;
    let chunkKey = null;
    try {
      chunkKey = Object.keys(window).find((k) => /^webpackChunk/i.test(k));
    } catch (_) {}
    const chunk = chunkKey ? window[chunkKey] : null;
    if (chunk && typeof chunk.push === "function") {
      const id = "wace_" + Math.floor(performance.now());
      try {
        chunk.push([[id], {}, (req) => (webpackReq = req)]);
      } catch (_) {}
    }
    return webpackReq;
  }

  function holders(m) {
    const out = [];
    if (m && typeof m === "object") out.push(m);
    try {
      if (m && m.default && typeof m.default === "object") out.push(m.default);
    } catch (_) {}
    return out;
  }

  // Enumerate every module (requires the captured webpack require) and return the
  // first exported holder matching `pred`.
  function scanModules(pred) {
    if (!webpackReq || !webpackReq.m) return null;
    for (const id in webpackReq.m) {
      let mod;
      try {
        mod = webpackReq(id);
      } catch (_) {
        continue;
      }
      for (const h of holders(mod)) {
        try {
          if (pred(h)) return h;
        } catch (_) {}
      }
    }
    return null;
  }

  // Pull the first present key off a module (checking .default too).
  function pickExport(mod, keys) {
    for (const h of holders(mod)) {
      for (const k of keys) {
        if (h[k]) return h[k];
      }
    }
    return null;
  }

  function looksLikeCollection(o) {
    return o && typeof o.getModelsArray === "function" && typeof o.get === "function";
  }

  // ---- build the store -----------------------------------------------------
  function build() {
    if (store) return true;
    captureWebpackRequire();

    // Chat collection — by name, else scan for a collection whose models carry a
    // WID with a server (g.us / c.us).
    let Chat =
      pickExport(getModule("WAWebChatCollection"), ["ChatCollection", "ChatCollectionImpl"]) ||
      (() => {
        const h = scanModules(
          (x) =>
            (x.ChatCollection && looksLikeCollection(x.ChatCollection)) ||
            (looksLikeCollection(x) &&
              (() => {
                const a = x.getModelsArray();
                return a && a[0] && a[0].id && ("server" in a[0].id || a[0].id._serialized);
              })())
        );
        return h ? h.ChatCollection || h : null;
      })();

    let Contact =
      pickExport(getModule("WAWebContactCollection"), ["ContactCollection", "ContactCollectionImpl"]) ||
      (() => {
        const h = scanModules((x) => x.ContactCollection && looksLikeCollection(x.ContactCollection));
        return h ? h.ContactCollection : null;
      })();

    let GroupMetadata =
      pickExport(getModule("WAWebGroupMetadataCollection"), ["GroupMetadataCollection"]) ||
      (() => {
        const h = scanModules((x) => x.GroupMetadataCollection && looksLikeCollection(x.GroupMetadataCollection));
        return h ? h.GroupMetadataCollection : null;
      })();

    let getMe =
      (() => {
        const m = getModule("WAWebUserPrefsMeUser");
        const f = pickExport(m, ["getMaybeMeUser", "getMeUser"]);
        return f ? f.bind(m) : null;
      })() ||
      (() => {
        const h = scanModules((x) => typeof x.getMaybeMeUser === "function");
        return h ? h.getMaybeMeUser.bind(h) : null;
      })();

    report = {
      hasWindowRequire: typeof window.require === "function",
      hasWebpackReq: !!webpackReq,
      hasChat: !!Chat,
      hasContact: !!Contact,
      hasGroupMetadata: !!GroupMetadata,
      hasMe: !!getMe,
    };

    if (!Chat || typeof Chat.getModelsArray !== "function") {
      console.warn(TAG, "Chat collection not found", report);
      return false;
    }
    store = { Chat, Contact, GroupMetadata, getMe };
    console.log(TAG, "store ready →", report);
    return true;
  }

  // ---- WID / contact helpers ----------------------------------------------
  function serialize(wid) {
    if (!wid) return "";
    if (typeof wid === "string") return wid;
    if (wid._serialized) return wid._serialized;
    try {
      if (wid.user && wid.server) return wid.user + "@" + wid.server;
    } catch (_) {}
    try {
      return wid.toString();
    } catch (_) {
      return "";
    }
  }
  function widInfo(wid) {
    const s = serialize(wid);
    const at = s.indexOf("@");
    return { serialized: s, user: at >= 0 ? s.slice(0, at) : s, server: at >= 0 ? s.slice(at + 1) : "" };
  }
  // A real, dialable number lives on a @c.us WID. @lid is a privacy id (hidden).
  function phoneFromWid(wid) {
    const i = widInfo(wid);
    if (i.server === "c.us" && /^[0-9]{5,}$/.test(i.user)) return i.user;
    return null;
  }
  function phoneFromContact(contact) {
    if (!contact) return null;
    try {
      if (contact.phoneNumber) {
        const p = phoneFromWid(contact.phoneNumber);
        if (p) return p;
      }
    } catch (_) {}
    try {
      const p = phoneFromWid(contact.id);
      if (p) return p;
    } catch (_) {}
    return null;
  }
  function nameFromContact(contact) {
    const out = { name: "", pushname: "", isSaved: false, isMe: false };
    if (!contact) return out;
    try {
      out.isSaved = !!contact.isMyContact;
    } catch (_) {}
    try {
      out.isMe = !!contact.isMe;
    } catch (_) {}
    try {
      out.pushname = contact.pushname || contact.notifyName || "";
    } catch (_) {}
    try {
      out.name =
        contact.name ||
        (contact.isMyContact && contact.formattedName) ||
        contact.verifiedName ||
        contact.pushname ||
        contact.notifyName ||
        "";
    } catch (_) {}
    return out;
  }
  function contactFor(p) {
    try {
      if (p.contact) return p.contact;
    } catch (_) {}
    if (store.Contact) {
      try {
        return store.Contact.get(p.id);
      } catch (_) {}
    }
    return null;
  }

  function isGroupChat(c) {
    try {
      if (c && c.id && c.id.server === "g.us") return true;
      if (c && c.isGroup) return true;
      const s = serialize(c && c.id);
      return s.indexOf("@g.us") > -1;
    } catch (_) {
      return false;
    }
  }
  function participantsArray(meta) {
    const parts = meta && meta.participants;
    if (!parts) return [];
    try {
      if (typeof parts.getModelsArray === "function") return parts.getModelsArray();
    } catch (_) {}
    if (Array.isArray(parts)) return parts;
    if (parts._models && Array.isArray(parts._models)) return parts._models;
    return [];
  }
  function meDigits() {
    try {
      const me = store.getMe && store.getMe();
      const p = phoneFromWid(me);
      return p || widInfo(me).user || "";
    } catch (_) {
      return "";
    }
  }

  // ---- capabilities --------------------------------------------------------
  function listGroups() {
    const arr = store.Chat.getModelsArray().filter(isGroupChat);
    const meD = meDigits();
    return arr.map((c) => {
      let admin = false;
      let size = null;
      try {
        const parts = participantsArray(c.groupMetadata);
        if (parts.length) {
          size = parts.length;
          if (meD) {
            const meP = parts.find((p) => {
              const ph = phoneFromWid(p.id) || phoneFromContact(contactFor(p));
              return ph && ph === meD;
            });
            if (meP) admin = !!(meP.isAdmin || meP.isSuperAdmin);
          }
        } else if (c.groupMetadata && c.groupMetadata.size != null) {
          size = c.groupMetadata.size;
        }
      } catch (_) {}
      return { id: serialize(c.id), name: c.formattedTitle || c.name || widInfo(c.id).user || "Group", size, admin };
    });
  }

  function getChat(groupId) {
    try {
      if (store.Chat.get) {
        const c = store.Chat.get(groupId);
        if (c) return c;
      }
    } catch (_) {}
    return store.Chat.getModelsArray().find((c) => serialize(c.id) === groupId) || null;
  }

  async function resolveMeta(chat, groupId) {
    // The chat model usually already carries groupMetadata with participants.
    let meta = chat ? chat.groupMetadata : null;
    if (meta && participantsArray(meta).length) return meta;
    // Otherwise ask the GroupMetadata collection (get, then network find).
    if (store.GroupMetadata) {
      try {
        if (store.GroupMetadata.get) {
          const m = store.GroupMetadata.get(groupId);
          if (m && participantsArray(m).length) return m;
        }
        if (store.GroupMetadata.find && chat && chat.id) {
          const m = await store.GroupMetadata.find(chat.id);
          if (m && participantsArray(m).length) return m;
        }
      } catch (_) {}
    }
    return meta;
  }

  async function extractGroup(groupId) {
    const chat = getChat(groupId);
    if (!chat) return { ok: false, error: "group not found in chat store" };
    const groupName = chat.formattedTitle || chat.name || "Group";
    const meta = await resolveMeta(chat, groupId);
    const parts = participantsArray(meta);
    if (!parts.length) return { ok: false, error: "no participants loaded — open the group once in WhatsApp, then retry" };

    const meD = meDigits();
    const members = parts.map((p) => {
      const contact = contactFor(p);
      const phone = phoneFromWid(p.id) || phoneFromContact(contact);
      const nm = nameFromContact(contact);
      const isMe = nm.isMe || (!!meD && phone === meD);
      return {
        number: phone,           // digits, or null when hidden (LID)
        hidden: !phone,
        lid: phone ? "" : serialize(p.id),
        name: nm.name,
        pushname: nm.pushname,
        isSaved: nm.isSaved,
        isAdmin: !!p.isAdmin,
        isSuperAdmin: !!p.isSuperAdmin,
        isMe,
      };
    });
    return { ok: true, groupId, groupName, members };
  }

  // ---- postMessage bridge --------------------------------------------------
  window.addEventListener("message", async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__wace !== "req") return;
    const reply = (payload) => window.postMessage({ __wace: "res", id: d.id, payload }, "*");
    try {
      const ok = build();
      if (d.action === "PROBE") return reply({ available: ok, canExtract: ok, report });
      if (!ok) return reply({ available: false, report });
      if (d.action === "LIST_GROUPS") return reply({ available: true, groups: listGroups() });
      if (d.action === "EXTRACT") return reply({ available: true, ...(await extractGroup(d.groupId)) });
      if (d.action === "DUMP") return reply({ available: true, report });
      reply({ available: false, error: "unknown action" });
    } catch (e) {
      reply({ available: false, error: String((e && e.message) || e) });
    }
  });

  setTimeout(() => {
    try {
      if (build()) console.log(TAG, "auto-probe:", report, "· groups:", listGroups().length);
    } catch (e) {
      console.warn(TAG, "auto-probe error", e);
    }
  }, 5000);

  console.log(TAG, "bridge installed");
})();
