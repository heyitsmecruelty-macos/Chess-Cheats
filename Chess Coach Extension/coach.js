/* Venice Chess Coach 2.6.0 - local Stockfish engine. SPDX-License-Identifier: GPL-3.0-or-later */
(function () {
  'use strict';
  if (window.__VCC && window.__VCC.started) return;
  const NS = (window.__VCC = { started: true });

  /* ============================================================
     ENGINE
     ============================================================ */
  function ENGINE_FACTORY() {
    const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
    const VAL = [0, 100, 320, 330, 500, 900, 20000];
    const CH = { 1: 'p', 2: 'n', 3: 'b', 4: 'r', 5: 'q', 6: 'k' };
    const FROMCH = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    const MATE = 29000;
    const PHASE_W = [0, 0, 1, 1, 2, 4, 0];
    const MAX_PHASE = 24;

    const board = new Int8Array(128);
    const keys = [];
    let turn = 1, ep = -1, halfmove = 0, castling = 0, ply = 0;

    const isSq = s => (s & 0x88) === 0;
    const sqName = s => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
    const sqFromName = n => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97);
    const to64 = s => ((s >> 4) << 3) | (s & 7);
    const pIdx = pc => (pc > 0 ? pc - 1 : 6 - pc - 1);
    const sideOf = pc => (pc > 0 ? 1 : -1);

    const KNIGHT_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
    const BISHOP_OFF = [-17, -15, 15, 17];
    const ROOK_OFF = [-16, -1, 1, 16];
    const KING_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];

    const PST = {
      1: [0,0,0,0,0,0,0,0, 5,10,10,-20,-20,10,10,5, 5,-5,-10,0,0,-10,-5,5, 0,0,0,20,20,0,0,0,
          5,5,10,25,25,10,5,5, 10,10,20,30,30,20,10,10, 50,50,50,50,50,50,50,50, 0,0,0,0,0,0,0,0],
      2: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,5,5,0,-20,-40, -30,0,10,15,15,10,0,-30,
          -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
          -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
      3: [-20,-10,-10,-10,-10,-10,-10,-20, -10,5,0,0,0,0,5,-10, -10,10,10,10,10,10,10,-10,
          -10,0,10,10,10,10,0,-10, -10,5,5,10,10,5,5,-10, -10,0,5,10,10,5,0,-10,
          -10,0,0,0,0,0,0,-10, -20,-10,-10,-10,-10,-10,-10,-20],
      4: [0,0,0,5,5,0,0,0, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
          -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
      5: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,5,0,0,0,0,-10, -10,5,5,5,5,5,0,-10,
          0,0,5,5,5,5,0,-5, -10,0,5,5,5,5,0,-10, -10,0,0,0,0,0,0,-10,
          -10,0,0,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
      6: [20,30,10,0,0,10,30,20, 20,20,0,0,0,0,20,20, -10,-20,-20,-20,-20,-20,-20,-10,
          -20,-30,-30,-40,-40,-30,-30,-20, -20,-30,-30,-40,-40,-30,-30,-20,
          -20,-30,-30,-40,-40,-30,-30,-20, -20,-30,-30,-40,-40,-30,-30,-20,
          -30,-40,-40,-50,-50,-40,-40,-30]
    };

    const EGT = {};
    for (const t of [1, 2, 3, 4, 5, 6]) EGT[t] = PST[t].slice();
    const EG_K = [-50,-40,-30,-20,-20,-30,-40,-50, -40,-20,0,0,0,0,-20,-40,
                  -30,0,20,30,30,20,0,-30, -20,0,30,40,40,30,0,-20,
                  -20,0,30,40,40,30,0,-20, -30,0,20,30,30,20,0,-30,
                  -40,-20,0,0,0,0,-20,-40, -50,-40,-30,-20,-20,-30,-40,-50];
    for (let i = 0; i < 64; i++) EGT[6][i] = EG_K[i];
    const PASS_BONUS = [0, 5, 10, 20, 34, 58, 96, 0];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      EGT[1][r * 8 + f] = PASS_BONUS[r] - Math.abs(3.5 - f) * 2;
    }

    let seed = 0x2f6e2b1;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
    const pieceKey = [];
    for (let i = 0; i < 12; i++) { const a = new Int32Array(128); for (let s = 0; s < 128; s++) a[s] = rnd(); pieceKey.push(a); }
    const castleKey = new Int32Array(16); for (let i = 0; i < 16; i++) castleKey[i] = rnd();
    const epKey = new Int32Array(128); for (let i = 0; i < 128; i++) epKey[i] = rnd();
    const sideKey = rnd();
    let key = 0;

    function setFen(fen) {
      board.fill(0); castling = 0; ep = -1; halfmove = 0; ply = 0;
      const parts = String(fen).trim().split(/\s+/);
      let r = 7, f = 0;
      for (const ch of parts[0]) {
        if (ch === '/') { r--; f = 0; }
        else if (ch >= '1' && ch <= '8') f += +ch;
        else {
          const t = FROMCH[ch.toLowerCase()];
          if (!t) continue;
          board[r * 16 + f] = ch === ch.toLowerCase() ? -t : t;
          f++;
        }
      }
      turn = parts[1] === 'b' ? -1 : 1;
      const c = parts[2] || '-';
      if (c.indexOf('K') >= 0) castling |= 1;
      if (c.indexOf('Q') >= 0) castling |= 2;
      if (c.indexOf('k') >= 0) castling |= 4;
      if (c.indexOf('q') >= 0) castling |= 8;
      if (parts[3] && parts[3] !== '-') {
        const s = sqFromName(parts[3]);
        const ok = turn === 1 ? board[s - 16] === -P : board[s + 16] === P;
        if (ok) ep = s;
      }
      halfmove = +(parts[4] || 0);
      key = 0;
      for (let s = 0; s < 128; s++) if (isSq(s) && board[s]) key ^= pieceKey[pIdx(board[s])][s];
      key ^= castleKey[castling];
      if (ep >= 0) key ^= epKey[ep];
      if (turn === -1) key ^= sideKey;
      keys.length = 0;
      keys.push(key);
    }

    const mk = (from, to, piece, captured, flags, promo) =>
      ({ from: from, to: to, piece: piece, captured: captured || 0, flags: flags || 0, promo: promo || 0 });

    function addPawn(list, from, to, cap) {
      for (const pr of [Q, R, B, N]) list.push(mk(from, to, list.us * P, cap, 0, pr));
    }

    function isAttacked(sq, by) {
      const pd = by === 1 ? -16 : 16;
      for (const d of [pd - 1, pd + 1]) { const s = sq + d; if (isSq(s) && board[s] === by * P) return true; }
      for (const d of KNIGHT_OFF) { const s = sq + d; if (isSq(s) && board[s] === by * N) return true; }
      for (const d of KING_OFF) { const s = sq + d; if (isSq(s) && board[s] === by * K) return true; }
      for (const d of BISHOP_OFF) {
        let s = sq + d;
        while (isSq(s)) { const p = board[s]; if (p) { if (p === by * B || p === by * Q) return true; break; } s += d; }
      }
      for (const d of ROOK_OFF) {
        let s = sq + d;
        while (isSq(s)) { const p = board[s]; if (p) { if (p === by * R || p === by * Q) return true; break; } s += d; }
      }
      return false;
    }

    function attackersTo(sq, by) {
      const out = [];
      const pd = by === 1 ? -16 : 16;
      for (const d of [pd - 1, pd + 1]) { const s = sq + d; if (isSq(s) && board[s] === by * P) out.push(s); }
      for (const d of KNIGHT_OFF) { const s = sq + d; if (isSq(s) && board[s] === by * N) out.push(s); }
      for (const d of KING_OFF) { const s = sq + d; if (isSq(s) && board[s] === by * K) out.push(s); }
      for (const d of BISHOP_OFF) {
        let s = sq + d;
        while (isSq(s)) { const p = board[s]; if (p) { if (p === by * B || p === by * Q) out.push(s); break; } s += d; }
      }
      for (const d of ROOK_OFF) {
        let s = sq + d;
        while (isSq(s)) { const p = board[s]; if (p) { if (p === by * R || p === by * Q) out.push(s); break; } s += d; }
      }
      return out;
    }

    function leastAttacker(sq, by) {
      let best = 0, bestV = Infinity;
      for (const s of attackersTo(sq, by)) {
        const v = VAL[Math.abs(board[s])];
        if (v < bestV) { bestV = v; best = s; }
      }
      return best;
    }

    function seeRec(sq, side) {
      const from = leastAttacker(sq, side);
      if (!from) return 0;
      const piece = board[from];
      const victim = board[sq];
      const gain = victim ? VAL[Math.abs(victim)] : 0;
      board[sq] = piece;
      board[from] = 0;
      const next = seeRec(sq, -side);
      board[from] = piece;
      board[sq] = victim;
      const net = gain - next;
      return net > 0 ? net : 0;
    }

    function see(m) {
      const us = sideOf(m.piece);
      const gain0 = (m.captured ? VAL[Math.abs(m.captured)] : 0) +
        (m.promo ? VAL[m.promo] - VAL[P] : 0);
      const from = m.from, to = m.to;
      const victim = board[to];
      const epCapSq = m.flags === 'ep' ? to - us * 16 : -1;
      const epVictim = epCapSq >= 0 ? board[epCapSq] : 0;
      if (epCapSq >= 0) board[epCapSq] = 0;
      board[to] = m.promo ? us * m.promo : m.piece;
      board[from] = 0;
      const next = seeRec(to, -us);
      board[from] = m.piece;
      board[to] = victim;
      if (epCapSq >= 0) board[epCapSq] = epVictim;
      return gain0 - next;
    }

    function kingSq(side) {
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        if (board[s] === side * K) return s;
      }
      return -1;
    }
    const inCheck = side => { const k = kingSq(side); return k >= 0 && isAttacked(k, -side); };

    function genPseudo() {
      const moves = [], us = turn, them = -us;
      moves.us = us;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const pc = board[sq];
        if (!pc || sideOf(pc) !== us) continue;
        const t = Math.abs(pc);
        if (t === P) {
          const dir = us * 16, startRank = us === 1 ? 1 : 6, promoRank = us === 1 ? 7 : 0;
          const one = sq + dir;
          if (isSq(one) && !board[one]) {
            if ((one >> 4) === promoRank) addPawn(moves, sq, one, 0);
            else {
              moves.push(mk(sq, one, pc));
              const two = sq + 2 * dir;
              if ((sq >> 4) === startRank && !board[two]) moves.push(mk(sq, two, pc, 0, 'double'));
            }
          }
          for (const d of [dir - 1, dir + 1]) {
            const to = sq + d; if (!isSq(to)) continue;
            const tp = board[to];
            if (tp && sideOf(tp) === them) {
              if ((to >> 4) === promoRank) addPawn(moves, sq, to, tp);
              else moves.push(mk(sq, to, pc, tp));
            } else if (!tp && to === ep) moves.push(mk(sq, to, pc, us === 1 ? P : -P, 'ep'));
          }
        } else if (t === N || t === K) {
          for (const d of (t === N ? KNIGHT_OFF : KING_OFF)) {
            const to = sq + d; if (!isSq(to)) continue;
            const tp = board[to];
            if (tp && sideOf(tp) === us) continue;
            moves.push(mk(sq, to, pc, tp));
          }
        } else {
          for (const d of (t === B ? BISHOP_OFF : t === R ? ROOK_OFF : KING_OFF)) {
            let to = sq + d;
            while (isSq(to)) {
              const tp = board[to];
              if (tp) { if (sideOf(tp) !== us) moves.push(mk(sq, to, pc, tp)); break; }
              moves.push(mk(sq, to, pc));
              to += d;
            }
          }
        }
      }
      if (us === 1) {
        if ((castling & 1) && board[4] === K && board[7] === R && !board[5] && !board[6] &&
            !isAttacked(4, -1) && !isAttacked(5, -1) && !isAttacked(6, -1)) moves.push(mk(4, 6, K, 0, 'castleK'));
        if ((castling & 2) && board[4] === K && board[0] === R && !board[1] && !board[2] && !board[3] &&
            !isAttacked(4, -1) && !isAttacked(3, -1) && !isAttacked(2, -1)) moves.push(mk(4, 2, K, 0, 'castleQ'));
      } else {
        if ((castling & 4) && board[116] === -K && board[119] === -R && !board[117] && !board[118] &&
            !isAttacked(116, 1) && !isAttacked(117, 1) && !isAttacked(118, 1)) moves.push(mk(116, 118, -K, 0, 'castleK'));
        if ((castling & 8) && board[116] === -K && board[112] === -R && !board[113] && !board[114] && !board[115] &&
            !isAttacked(116, 1) && !isAttacked(115, 1) && !isAttacked(114, 1)) moves.push(mk(116, 114, -K, 0, 'castleQ'));
      }
      return moves;
    }

    function makeMove(m) {
      const u = { m: m, captured: m.captured, castling: castling, ep: ep, halfmove: halfmove, epCap: 0, key: key };
      const us = sideOf(m.piece);
      key ^= pieceKey[pIdx(m.piece)][m.from];
      key ^= castleKey[castling];
      if (ep >= 0) key ^= epKey[ep];
      key ^= sideKey;

      board[m.from] = 0;
      if (m.flags === 'ep') {
        const capSq = m.to - us * 16;
        u.epCap = board[capSq];
        key ^= pieceKey[pIdx(u.epCap)][capSq];
        board[capSq] = 0;
      } else if (m.captured) {
        key ^= pieceKey[pIdx(m.captured)][m.to];
      }
      const placed = m.promo ? us * m.promo : m.piece;
      board[m.to] = placed;
      key ^= pieceKey[pIdx(placed)][m.to];

      if (m.flags === 'castleK') {
        if (us === 1) { board[5] = board[7]; board[7] = 0; key ^= pieceKey[pIdx(R)][7] ^ pieceKey[pIdx(R)][5]; }
        else { board[117] = board[119]; board[119] = 0; key ^= pieceKey[pIdx(-R)][119] ^ pieceKey[pIdx(-R)][117]; }
      }
      if (m.flags === 'castleQ') {
        if (us === 1) { board[3] = board[0]; board[0] = 0; key ^= pieceKey[pIdx(R)][0] ^ pieceKey[pIdx(R)][3]; }
        else { board[115] = board[112]; board[112] = 0; key ^= pieceKey[pIdx(-R)][112] ^ pieceKey[pIdx(-R)][115]; }
      }

      if (m.piece === K) castling &= ~3;
      if (m.piece === -K) castling &= ~12;
      if (m.from === 0 || m.to === 0) castling &= ~2;
      if (m.from === 7 || m.to === 7) castling &= ~1;
      if (m.from === 112 || m.to === 112) castling &= ~8;
      if (m.from === 119 || m.to === 119) castling &= ~4;
      key ^= castleKey[castling];

      ep = m.flags === 'double' ? m.from + us * 16 : -1;
      if (ep >= 0) key ^= epKey[ep];

      halfmove = (m.captured || Math.abs(m.piece) === P) ? 0 : halfmove + 1;
      turn = -turn; ply++;
      keys.push(key);
      return u;
    }

    function unmakeMove(u) {
      const m = u.m, us = sideOf(m.piece);
      keys.pop();
      turn = -turn; ply--;
      board[m.from] = m.piece;
      board[m.to] = 0;
      if (m.flags === 'ep') board[m.to - us * 16] = u.epCap;
      else if (m.captured) board[m.to] = m.captured;
      if (m.flags === 'castleK') { if (us === 1) { board[7] = board[5]; board[5] = 0; } else { board[119] = board[117]; board[117] = 0; } }
      if (m.flags === 'castleQ') { if (us === 1) { board[0] = board[3]; board[3] = 0; } else { board[112] = board[115]; board[115] = 0; } }
      castling = u.castling; ep = u.ep; halfmove = u.halfmove; key = u.key;
    }

    function makeNull() {
      const u = { ep: ep, key: key, halfmove: halfmove };
      key ^= sideKey;
      if (ep >= 0) key ^= epKey[ep];
      ep = -1; halfmove++; turn = -turn; ply++;
      keys.push(key);
      return u;
    }
    function unmakeNull(u) { keys.pop(); turn = -turn; ply--; ep = u.ep; key = u.key; halfmove = u.halfmove; }

    function genLegal() {
      const out = [], us = turn;
      for (const m of genPseudo()) {
        const u = makeMove(m);
        if (!inCheck(us)) out.push(m);
        unmakeMove(u);
      }
      return out;
    }

    function mobilityOf(sq, t, us) {
      let n = 0;
      if (t === N) {
        for (const d of KNIGHT_OFF) {
          const s = sq + d;
          if (isSq(s) && (!board[s] || sideOf(board[s]) !== us)) n++;
        }
        return n;
      }
      const offs = t === B ? BISHOP_OFF : t === R ? ROOK_OFF : KING_OFF;
      for (const d of offs) {
        let s = sq + d;
        while (isSq(s)) {
          const p = board[s];
          if (p) { if (sideOf(p) !== us) n++; break; }
          n++; s += d;
        }
      }
      return n;
    }

    function drawish() {
      let wm = 0, bm = 0, wp = 0, bp = 0, wb = 0, bb = 0;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const pc = board[s];
        if (!pc) continue;
        const t = Math.abs(pc);
        if (t === P) { if (pc > 0) wp++; else bp++; }
        else if (t === B) { if (pc > 0) { wb++; wm += 3; } else { bb++; bm += 3; } }
        else if (t === N) { if (pc > 0) wm += 3; else bm += 3; }
        else if (t === R) { if (pc > 0) wm += 5; else bm += 5; }
        else if (t === Q) { if (pc > 0) wm += 9; else bm += 9; }
      }
      if (wp || bp) return false;
      if (!wm && !bm) return true;
      if (wm <= 3 && !bm) return true;
      if (bm <= 3 && !wm) return true;
      if (wm === 3 && bm === 3 && wb === 1 && bb === 1) return true;
      return false;
    }

    function evaluate() {
      let mg = 0, eg = 0, phase = 0;
      const wp = new Int8Array(8), bp = new Int8Array(8);
      const wpMask = new Int32Array(8), bpMask = new Int32Array(8);
      let wb = 0, bb = 0;
      const pawns = [];

      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const pc = board[s];
        if (!pc) continue;
        const t = Math.abs(pc), side = sideOf(pc);
        const idx = pc > 0 ? to64(s) : (to64(s) ^ 56);
        phase += PHASE_W[t];
        const m = VAL[t], a = PST[t][idx], b = EGT[t][idx];
        if (side === 1) { mg += m + a; eg += m + b; }
        else { mg -= m + a; eg -= m + b; }

        if (t === P) {
          const f = s & 7, r = s >> 4;
          if (side === 1) { wp[f]++; wpMask[f] |= 1 << r; pawns.push(s); }
          else { bp[f]++; bpMask[f] |= 1 << r; pawns.push(s); }
        } else if (t === B) { if (side === 1) wb++; else bb++; }
        else if (t === N || t === R || t === Q) {
          const mo = mobilityOf(s, t, side);
          const wmg = t === N ? 4 : t === B ? 4 : t === R ? 2 : 1;
          const weg = t === N ? 2 : t === B ? 3 : t === R ? 4 : 2;
          if (side === 1) { mg += mo * wmg; eg += mo * weg; }
          else { mg -= mo * wmg; eg -= mo * weg; }
        }
      }

      if (wb >= 2) { mg += 30; eg += 44; }
      if (bb >= 2) { mg -= 30; eg -= 44; }

      for (let f = 0; f < 8; f++) {
        if (wp[f] > 1) { mg -= 11 * (wp[f] - 1); eg -= 17 * (wp[f] - 1); }
        if (bp[f] > 1) { mg += 11 * (bp[f] - 1); eg += 17 * (bp[f] - 1); }
        const wIso = wp[f] && !(f > 0 && wp[f - 1]) && !(f < 7 && wp[f + 1]);
        const bIso = bp[f] && !(f > 0 && bp[f - 1]) && !(f < 7 && bp[f + 1]);
        if (wIso) { mg -= 12; eg -= 18; }
        if (bIso) { mg += 12; eg += 18; }
      }

      for (const s of pawns) {
        const pc = board[s], side = sideOf(pc);
        const f = s & 7, r = s >> 4;
        if (side === 1) {
          const ahead = (bpMask[f] | (f > 0 ? bpMask[f - 1] : 0) | (f < 7 ? bpMask[f + 1] : 0)) >> (r + 1);
          if (!ahead) { mg += PASS_BONUS[r] * 0.6; eg += PASS_BONUS[r] * 1.5; }
        } else {
          const rr = 7 - r;
          const ahead = (wpMask[f] | (f > 0 ? wpMask[f - 1] : 0) | (f < 7 ? wpMask[f + 1] : 0)) & ((1 << r) - 1);
          if (!ahead) { mg -= PASS_BONUS[rr] * 0.6; eg -= PASS_BONUS[rr] * 1.5; }
        }
      }

      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const pc = board[s];
        if (pc !== R && pc !== -R) continue;
        const f = s & 7;
        const own = pc > 0 ? wp[f] : bp[f];
        const opp = pc > 0 ? bp[f] : wp[f];
        if (!own) { const v = opp ? 9 : 18; if (pc > 0) mg += v; else mg -= v; }
      }

      const wk = kingSq(1), bk = kingSq(-1);

      for (const side of [1, -1]) {
        const k = side === 1 ? wk : bk;
        if (k < 0) continue;
        let shield = 0;
        const front = side === 1 ? k + 16 : k - 16;
        for (const d of [-1, 0, 1]) {
          const s = front + d;
          if (isSq(s) && board[s] === side * P) shield++;
        }
        const sv = shield * 9;
        if (side === 1) mg += sv; else mg -= sv;
      }

      if (phase > 6) {
        for (const side of [1, -1]) {
          const k = side === 1 ? wk : bk;
          if (k < 0) continue;
          let ring = 0, heavy = 0;
          for (const d of KING_OFF) {
            const s = k + d;
            if (!isSq(s)) continue;
            if (isAttacked(s, -side)) {
              ring++;
              for (const a of attackersTo(s, -side)) {
                if (VAL[Math.abs(board[a])] >= 500) heavy++;
              }
            }
          }
          let pen = ring * 6 + Math.min(24, heavy * 4);
          const kf = k & 7;
          const ownPawns = side === 1 ? wp : bp;
          let open = 0;
          for (const f of [kf - 1, kf, kf + 1]) if (f >= 0 && f < 8 && !ownPawns[f]) open++;
          pen += open * 7;
          if (side === 1) mg -= pen; else mg += pen;
        }
      } else {
        for (const side of [1, -1]) {
          const k = side === 1 ? wk : bk;
          if (k < 0 || bk < 0) continue;
          const cd = Math.abs((k & 7) - (bk & 7)) + Math.abs((k >> 4) - (bk >> 4));
          const ctr = Math.abs(3.5 - (k & 7)) + Math.abs(3.5 - (k >> 4));
          const v = Math.round((14 - cd) * 4 + (3.5 - ctr) * 3);
          if (side === 1) mg += v; else mg -= v;
        }
      }

      const ph = Math.min(MAX_PHASE, phase);
      const score = ((mg * ph) + (eg * (MAX_PHASE - ph))) / MAX_PHASE;
      const final = turn === 1 ? score : -score;
      return Math.round(final) + 8;
    }

    let nodes = 0, deadline = 0, softDeadline = 0, aborted = false;
    let tt = new Map();
    let generation = 0;
    const killers = [];
    const history = [];
    for (let i = 0; i < 12; i++) history.push(new Int32Array(128));
    const counterMove = new Map();

    function orderMoves(moves, ply, ttm, prevTo) {
      const scored = [];
      const cm = prevTo >= 0 ? counterMove.get(prevTo) : null;
      for (const m of moves) {
        let s;
        if (ttm && m.from === ttm.from && m.to === ttm.to && m.promo === ttm.promo) s = 3000000;
        else if (m.captured || m.promo) {
          s = 1000000 + see(m) * 8 + (m.captured ? VAL[Math.abs(m.captured)] : 0) * 2;
          if (m.promo) s += 500 + VAL[m.promo];
        } else {
          const k = killers[ply];
          if (k && k[0] && k[0].from === m.from && k[0].to === m.to) s = 900000;
          else if (k && k[1] && k[1].from === m.from && k[1].to === m.to) s = 850000;
          else if (cm && cm.from === m.from && cm.to === m.to) s = 800000;
          else s = history[pIdx(m.piece)][m.to] | 0;
        }
        scored.push({ m: m, s: s });
      }
      scored.sort((a, b) => b.s - a.s);
      const out = new Array(scored.length);
      for (let i = 0; i < scored.length; i++) out[i] = scored[i].m;
      return out;
    }

    function quiesce(alpha, beta, ply, qd) {
      if ((nodes++ & 511) === 0 && performance.now() > deadline) aborted = true;
      if (aborted) return alpha;
      const checked = inCheck(turn);
      let stand = -Infinity;
      const capped = checked && qd >= 16;
      if (!checked) {
        stand = evaluate();
        if (stand >= beta) return beta;
        if (stand > alpha) alpha = stand;
        if (qd >= 8) return alpha;
      }

      const moves = orderMoves(genPseudo().filter(m => checked || m.captured || m.promo), ply, null, -1);
      let legal = 0;
      for (const m of moves) {
        if (!checked && !m.promo) {
          const g = see(m);
          if (g < -70) continue;
          if (stand + g + 140 < alpha) continue;
        }
        const u = makeMove(m);
        if (inCheck(-turn)) { unmakeMove(u); continue; }
        legal++;
        const s = capped ? -evaluate() : -quiesce(-beta, -alpha, ply + 1, qd + 1);
        unmakeMove(u);
        if (aborted) return alpha;
        if (s >= beta) return beta;
        if (s > alpha) alpha = s;
      }
      if (checked && !legal) return -MATE + ply;
      return alpha;
    }

    function negamax(depth, alpha, beta, ply, canNull, ext, prevTo) {
      if ((nodes++ & 511) === 0 && performance.now() > deadline) aborted = true;
      if (aborted) return alpha;
      if (halfmove >= 100) return 0;

      if (ply > 0) {
        for (let i = keys.length - 3; i >= 0; i -= 2) {
          if (keys[i] === key) return 0;
        }
      }

      const us = turn;
      const checked = inCheck(us);
      if (checked && ext < 12) depth++;
      if (depth <= 0) return quiesce(alpha, beta, ply, 0);

      const entry = tt.get(key);
      let ttm = null;
      if (entry) {
        ttm = entry.m;
        if (entry.d >= depth && ply > 0) {
          if (entry.f === 0) return entry.s;
          if (entry.f === 1 && entry.s <= alpha) return entry.s;
          if (entry.f === 2 && entry.s >= beta) return entry.s;
        }
      }

      const staticEval = evaluate();

      if (!checked && depth <= 2 && Math.abs(beta) < MATE - 200) {
        if (staticEval - 200 * depth >= beta) return staticEval;
      }

      if (!ttm && depth >= 5 && ply > 0) {
        negamax(depth - 2, alpha, beta, ply, false, ext, prevTo);
        const e2 = tt.get(key);
        if (e2 && e2.m) ttm = e2.m;
      }

      const moves = genLegal();
      if (!moves.length) return checked ? -MATE + ply : 0;

      if (canNull && !checked && depth >= 3 && Math.abs(beta) < MATE - 200 && staticEval >= beta - 40) {
        const u = makeNull();
        const s = -negamax(depth - 3, -beta, -beta + 1, ply + 1, false, ext, -1);
        unmakeNull(u);
        if (!aborted && s >= beta) return beta;
      }

      const ordered = orderMoves(moves, ply, ttm, prevTo);

      let singular = false;
      if (ttm && depth >= 7 && entry && entry.d >= depth && Math.abs(entry.s) < MATE - 200 && ply > 0) {
        const b2 = entry.s - 20;
        let alt = -Infinity, cnt = 0;
        for (const m of ordered) {
          if (m.from === ttm.from && m.to === ttm.to && m.promo === ttm.promo) continue;
          if (++cnt > 12) break;
          const u = makeMove(m);
          if (inCheck(us)) { unmakeMove(u); continue; }
          const s = -negamax(depth - 4, -b2 - 1, -b2, ply + 1, true, ext, m.to);
          unmakeMove(u);
          if (aborted) break;
          if (s > alt) alt = s;
        }
        if (!aborted && alt < b2) singular = true;
      }

      let best = -Infinity, bestMove = null, legal = 0;
      const futility = !checked && depth <= 2 && Math.abs(alpha) < MATE - 200;

      for (let i = 0; i < ordered.length; i++) {
        const m = ordered[i];
        const isTT = ttm && m.from === ttm.from && m.to === ttm.to && m.promo === ttm.promo;
        const u = makeMove(m);
        if (inCheck(us)) { unmakeMove(u); continue; }
        legal++;
        const givesCheck = inCheck(turn);
        const quiet = !m.captured && !m.promo;

        if (futility && quiet && legal > 1 && !givesCheck &&
            staticEval + 130 * depth + 100 <= alpha) { unmakeMove(u); continue; }

        if (quiet && !givesCheck && depth <= 3 && legal > 6 + depth * 6 && !checked &&
            Math.abs(alpha) < MATE - 200) { unmakeMove(u); continue; }

        let nextExt = givesCheck ? ext + 1 : ext;
        if (isTT && singular) nextExt = ext + 1;

        let s;
        if (legal === 1) {
          s = -negamax(depth - 1, -beta, -alpha, ply + 1, true, nextExt, m.to);
        } else if (quiet && depth >= 3 && legal > 4 && !checked && !givesCheck && !singular) {
          s = -negamax(depth - 2, -alpha - 1, -alpha, ply + 1, true, ext, m.to);
          if (!aborted && s > alpha) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true, ext, m.to);
        } else {
          s = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true, nextExt, m.to);
          if (!aborted && s > alpha && s < beta) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true, nextExt, m.to);
        }
        unmakeMove(u);

        if (aborted) return best === -Infinity ? alpha : best;

        if (s > best) {
          best = s; bestMove = m;
          if (s > alpha) alpha = s;
        }
        if (alpha >= beta) {
          if (quiet) {
            const k = killers[ply] || (killers[ply] = [null, null]);
            if (!k[0] || k[0].from !== m.from || k[0].to !== m.to) { k[1] = k[0]; k[0] = m; }
            if (prevTo >= 0) {
              if (counterMove.size > 4096) counterMove.clear();
              counterMove.set(prevTo, m);
            }
            const h = history[pIdx(m.piece)];
            h[m.to] = Math.min(60000, h[m.to] + depth * depth);
          }
          break;
        }
      }

      if (!legal) return checked ? -MATE + ply : 0;
      if (!aborted) {
        const flag = best <= alpha ? 1 : best >= beta ? 2 : 0;
        const old = tt.get(key);
        if (!old || old.d <= depth || old.gen !== generation) {
          tt.set(key, { d: depth, s: best, f: flag, m: bestMove, gen: generation });
        }
        if (tt.size > 500000) tt.clear();
      }
      return best;
    }

    function extractPV(first, max) {
      const line = [], undo = [];
      let m = first;
      for (let i = 0; i < max && m; i++) {
        line.push(m);
        undo.push(makeMove(m));
        const e = tt.get(key);
        m = null;
        if (e && e.m) {
          for (const c of genLegal()) {
            if (c.from === e.m.from && c.to === e.m.to && c.promo === e.m.promo) { m = c; break; }
          }
        }
      }
      while (undo.length) unmakeMove(undo.pop());
      return line;
    }

    function searchRoot(maxDepth, budget) {
      nodes = 0; aborted = false;
      const start = performance.now();
      deadline = start + budget;
      softDeadline = start + budget * 0.62;
      tt = new Map();
      generation++;
      killers.length = 0;
      for (const h of history) h.fill(0);
      counterMove.clear();

      const moves = genLegal();
      if (!moves.length) return { results: [], depth: 0, pv: [] };
      const results = moves.map(m => ({ m: m, score: 0 }));

      let done = 0;
      for (let d = 1; d <= maxDepth; d++) {
        const snapshot = results.map(r => r.score);
        let wide = d < 3;
        let alpha = wide ? -Infinity : results[0].score - 45;
        let beta = wide ? Infinity : results[0].score + 45;
        let pass = 0, stop = false;

        for (;;) {
          let low = false, high = false, broke = false;
          for (const r of results) {
            const u = makeMove(r.m);
            const s = -negamax(d - 1, -beta, -alpha, 1, true, 0, r.m.to);
            unmakeMove(u);
            r.score = s;
            if (s <= alpha) low = true;
            if (s >= beta) high = true;
            if (aborted) { broke = true; break; }
          }
          if (broke) { stop = true; break; }
          results.sort((a, b) => b.score - a.score);
          if (wide || (!low && !high) || ++pass > 3) { done = d; break; }
          if (low) alpha = Math.max(-Infinity, alpha - 140 * pass);
          if (high) beta = Math.min(Infinity, beta + 140 * pass);
        }

        if (stop) {
          for (let i = 0; i < results.length; i++) results[i].score = snapshot[i];
          break;
        }
        if (Math.abs(results[0].score) > MATE - 200 && d >= 2) break;
        if (performance.now() > softDeadline) break;
      }
      results.sort((a, b) => b.score - a.score);
      return { results: results, depth: done || 1, pv: extractPV(results[0].m, 12) };
    }

    function cfgFor(rating, tc, override, deep) {
      const eff = Math.min(2900, rating + 120);
      let depth, window, temp, blunder;
      if (eff < 400)       { depth = 3;  window = 320; temp = 150; blunder = 0.42; }
      else if (eff < 700)  { depth = 4;  window = 260; temp = 120; blunder = 0.32; }
      else if (eff < 1000) { depth = 5;  window = 200; temp = 90;  blunder = 0.26; }
      else if (eff < 1300) { depth = 6;  window = 150; temp = 62;  blunder = 0.17; }
      else if (eff < 1700) { depth = 7;  window = 105; temp = 45;  blunder = 0.095; }
      else if (eff < 2000) { depth = 9;  window = 72;  temp = 30;  blunder = 0.05; }
      else if (eff < 2300) { depth = 11; window = 52;  temp = 20;  blunder = 0.025; }
      else                 { depth = 13; window = 36;  temp = 12;  blunder = 0.01; }

      if (tc === 'bullet') depth -= 1;
      if (tc === 'rapid' || tc === 'classical') depth += 1;
      if (override > 0) depth = override;
      if (deep) depth = Math.max(depth, 14);
      depth = Math.max(1, Math.min(20, depth));

      let budget = Math.max(200, Math.min(1200, 175 + eff * 0.55));
      if (tc === 'bullet') budget *= 0.5;
      if (tc === 'rapid') budget *= 1.3;
      if (tc === 'classical') budget *= 1.7;
      if (override > 0) budget = Math.max(budget, override * 330);
      if (deep) budget = Math.max(budget, 5200);
      budget = Math.min(7000, budget);

      return { depth: depth, window: window, temp: temp, blunder: blunder, budget: budget };
    }

    function isSacrifice(m) {
      if (Math.abs(m.piece) === P || Math.abs(m.piece) === K || m.promo) return false;
      return see(m) <= -100;
    }

    function punishable(results) {
      if (!results || !results.length) return false;
      const best = results[0].score;
      if (best > MATE - 200) return true;
      if (best >= 420) return true;
      const gap = results.length > 1 ? best - results[1].score : 9999;
      if (gap >= 160 && best >= 100) return true;
      const bm = results[0].m;
      if (bm.captured && see(bm) >= 160) return true;
      if (bm.promo && !bm.captured) return true;
      return false;
    }

    function pick(results, cfg, sacBias, force) {
      if (!results.length) return null;
      if (force) {
        const top = results[0].score;
        const close = results.filter(r => r.score >= top - 12);
        if (close.length > 1) return close[Math.floor(Math.random() * close.length)];
        return results[0];
      }
      const best = results[0].score;
      let cands = results.filter(r => r.score > best - cfg.window);
      if (!cands.length) cands = [results[0]];
      if (sacBias > 0) {
        cands = cands.filter(r => !isSacrifice(r.m) ||
          (best >= 120 && r.score >= 120 && r.score >= best - 20));
        if (!cands.length) cands = [results.find(r => !isSacrifice(r.m)) || results[0]];
        const sacs = cands.filter(r => isSacrifice(r.m));
        if (sacs.length) cands = cands.concat(sacs, sacs);
      }
      if (Math.random() < cfg.blunder && cands.length > 2) {
        const tail = cands.slice(Math.floor(cands.length / 2));
        return tail[Math.floor(Math.random() * tail.length)];
      }
      const weights = cands.map(r => Math.exp(-(best - r.score + (Math.random() - 0.5) * 8) / cfg.temp));
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      for (let i = 0; i < cands.length; i++) { roll -= weights[i]; if (roll <= 0) return cands[i]; }
      return cands[0];
    }

    function toSAN(m) {
      const t = Math.abs(m.piece);
      if (m.flags === 'castleK') return 'O-O' + suffix(m);
      if (m.flags === 'castleQ') return 'O-O-O' + suffix(m);
      let san = '';
      if (t !== P) {
        san += CH[t].toUpperCase();
        const others = genLegal().filter(x => x.to === m.to && x.piece === m.piece && x.from !== m.from);
        if (others.length) {
          const sameFile = others.some(x => (x.from & 7) === (m.from & 7));
          const sameRank = others.some(x => (x.from >> 4) === (m.from >> 4));
          if (!sameFile) san += 'abcdefgh'[m.from & 7];
          else if (!sameRank) san += String((m.from >> 4) + 1);
          else san += sqName(m.from);
        }
      } else if (m.captured) san += 'abcdefgh'[m.from & 7];
      if (m.captured) san += 'x';
      san += sqName(m.to);
      if (m.promo) san += '=' + CH[m.promo].toUpperCase();
      return san + suffix(m);
    }

    function suffix(m) {
      const u = makeMove(m);
      const check = inCheck(turn);
      const mate = check && !genLegal().length;
      unmakeMove(u);
      return mate ? '#' : check ? '+' : '';
    }

    function describe(m) {
      const us = sideOf(m.piece);
      const d = { cap: m.captured ? Math.abs(m.captured) : 0, mate: false, check: false, castle: false,
                  promo: 0, center: false, develop: false, hangs: false, sac: isSacrifice(m) };
      const t = Math.abs(m.piece);
      if (t !== P && (m.from >> 4) === (us === 1 ? 0 : 7)) d.develop = true;
      if (m.flags === 'castleK' || m.flags === 'castleQ') d.castle = true;
      if (m.promo) d.promo = m.promo;
      const file = m.to & 7, rank = m.to >> 4;
      if ((file === 3 || file === 4) && (rank === 3 || rank === 4)) d.center = true;
      const u = makeMove(m);
      d.check = inCheck(turn);
      d.mate = d.check && !genLegal().length;
      const mover = board[m.to];
      if (mover && isAttacked(m.to, -us) && !isAttacked(m.to, us)) d.hangs = true;
      unmakeMove(u);
      return d;
    }

    const BOOK = {
      0: ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'e2e3', 'd2d3', 'b1c3'],
      1: ['e7e5', 'c7c5', 'e7e6', 'd7d5', 'g8f6', 'c7c6', 'g7g6', 'd7d6', 'b8c6'],
      2: ['g1f3', 'b1c3', 'f1c4', 'f1b5', 'c2c3', 'd2d4', 'b1d2', 'f2f4'],
      3: ['b8c6', 'g8f6', 'f8c5', 'f8b4', 'e7e6', 'd7d6', 'c7c5', 'g7g6'],
      4: ['f1c4', 'f1b5', 'd2d4', 'c2c3', 'e1g1', 'b1c3', 'd1e2', 'b2b3'],
      5: ['g8f6', 'f8c5', 'f8b4', 'e7e6', 'd7d5', 'e8g8', 'b8c6', 'd7d6']
    };

    function bookMove(gamePly) {
      const pool = BOOK[gamePly];
      if (!pool) return null;
      const options = genLegal().filter(m => pool.indexOf(sqName(m.from) + sqName(m.to)) >= 0);
      if (!options.length) return null;
      return options[Math.floor(Math.random() * options.length)];
    }

    function lineMove(all, line, gamePly) {
      if (!line || !line.length || gamePly >= line.length) return null;
      const want = line[gamePly];
      for (const m of all) {
        if (sqName(m.from) + sqName(m.to) + (m.promo ? CH[m.promo] : '') === want) return m;
      }
      return null;
    }

    function mateDist(score, us) {
      if (Math.abs(score) <= MATE - 200) return 0;
      const mv = Math.ceil((MATE - Math.abs(score)) / 2);
      return (score > 0 ? 1 : -1) * mv * (us === 1 ? 1 : -1);
    }

    function solve(fen, rating, sacBias, override, tc, deep, clock, boost, alwaysPunish, line, startPly) {
      setFen(fen);
      if (inCheck(-turn)) throw new Error('Illegal position');
      const all = genLegal();
      if (!all.length) return { empty: true, san: inCheck(turn) ? 'checkmate' : 'stalemate' };
      if (drawish()) return { empty: true, san: 'draw' };

      const gamePly = Math.max(0, startPly | 0);
      const cfg = cfgFor(Math.max(150, Math.min(3000, +rating || 1200)), tc || 'unknown', +override || 0, !!deep);
      const us = turn;

      if (boost) {
        cfg.depth = Math.max(cfg.depth, 9);
        cfg.budget = Math.min(3200, cfg.budget * 2.1);
        cfg.window *= 0.5;
        cfg.temp *= 0.5;
        cfg.blunder *= 0.4;
      }
      if (alwaysPunish) {
        cfg.depth = Math.max(cfg.depth, 7);
        cfg.budget = Math.min(3000, cfg.budget * 1.7);
      }
      if (clock && clock > 0) {
        const cap = Math.max(90, Math.min(cfg.budget, clock * 26));
        cfg.budget = Math.min(cfg.budget, cap);
        if (clock < 12) cfg.depth = Math.max(2, cfg.depth - 2);
      }

      let chosen = null, out = null, depthUsed = cfg.depth, book = false, opening = false;
      const lm = lineMove(all, line, gamePly);
      if (lm) { chosen = { m: lm, score: 0 }; opening = true; }

      if (!chosen && (!alwaysPunish || gamePly < 3)) {
        const bm = bookMove(gamePly);
        if (bm && Math.random() < (boost ? 0.92 : 0.85)) { chosen = { m: bm, score: 0 }; book = true; }
      }

      let forced = false;
      if (!chosen) {
        out = searchRoot(cfg.depth, cfg.budget);
        depthUsed = out.depth;
        if (!out.results.length) throw new Error('No moves');
        forced = punishable(out.results);
        chosen = boost ? out.results[0] : pick(out.results, cfg, +sacBias || 0, forced);
      }

      const results = out ? out.results : null;
      const m = chosen.m;
      const cpRoot = chosen.score;
      const bestCp = results ? results[0].score : cpRoot;
      const second = results && results.length > 1 ? results[1].score : -Infinity;
      const loss = Math.max(0, bestCp - cpRoot);
      const gap = results && results.length > 1 ? bestCp - second : 9999;

      const lines = [];
      if (results) for (const r of results.slice(0, 3)) {
        lines.push({ san: toSAN(r.m), cp: us === 1 ? r.score : -r.score, d: describe(r.m) });
      }

      const pvSan = [];
      if (out && out.pv) {
        const undo = [];
        for (const pm of out.pv) { pvSan.push(toSAN(pm)); undo.push(makeMove(pm)); }
        while (undo.length) unmakeMove(undo.pop());
      }

      return {
        uci: sqName(m.from) + sqName(m.to) + (m.promo ? CH[m.promo] : ''),
        san: toSAN(m), from: m.from, to: m.to, promo: m.promo,
        scoreCp: us === 1 ? cpRoot : -cpRoot,
        mateIn: mateDist(cpRoot, us),
        bestMateIn: results ? mateDist(bestCp, us) : 0,
        loss: loss, gap: gap, only: all.length === 1, book: book, depth: depthUsed,
        opening: opening, forced: forced,
        detail: describe(m), sacrifice: isSacrifice(m), lines: lines, pv: pvSan
      };
    }

    function moveForUci(uci) {
      const match = String(uci || '').match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
      if (!match) return null;
      const from = sqFromName(match[1]), to = sqFromName(match[2]);
      const promo = match[3] ? FROMCH[match[3]] : 0;
      return genLegal().find(m => m.from === from && m.to === to && m.promo === promo) || null;
    }

    function formatUci(fen, uci) {
      setFen(fen);
      const legal = genLegal();
      const m = moveForUci(uci);
      if (!m) return null;
      return {
        uci: sqName(m.from) + sqName(m.to) + (m.promo ? CH[m.promo] : ''),
        from: m.from, to: m.to, promo: m.promo, san: toSAN(m), detail: describe(m),
        sacrifice: isSacrifice(m), only: legal.length === 1
      };
    }

    function formatPv(fen, moves) {
      setFen(fen);
      const san = [], undo = [];
      for (const uci of moves || []) {
        const m = moveForUci(uci);
        if (!m) break;
        san.push(toSAN(m));
        undo.push(makeMove(m));
      }
      while (undo.length) unmakeMove(undo.pop());
      return san;
    }

    function positionStatus(fen) {
      setFen(fen);
      return { legalCount: genLegal().length, check: inCheck(turn) };
    }

    function openingUci(fen, gamePly) {
      setFen(fen);
      const m = bookMove(Math.max(0, gamePly | 0));
      return m ? sqName(m.from) + sqName(m.to) + (m.promo ? CH[m.promo] : '') : null;
    }

    return {
      solve: solve, formatUci: formatUci, formatPv: formatPv,
      positionStatus: positionStatus, openingUci: openingUci
    };
  }

  /* ============================================================
     OPENINGS
     ============================================================ */
  const OPENINGS = [
    { id: 'carlsen', name: 'Carlsen \u2014 English Attack', side: 'w',
      line: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','a7a6','c1e3'] },
    { id: 'carokann', name: 'Caro-Kann', side: 'b',
      line: ['e2e4','c7c6','d2d4','d7d5','b1c3','d5e4','c3e4','c8f5','e4g3','f5g6'] },
    { id: 'qgambit', name: "Queen's Gambit", side: 'w',
      line: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8e7'] },
    { id: 'kid', name: "King's Indian", side: 'b',
      line: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g1f3','e8g8'] },
    { id: 'scholar', name: "Scholar's Mate", side: 'w',
      line: ['e2e4','e7e5','f1c4','b8c6','d1h5','g8f6','h5f7'] },
    { id: 'italian', name: 'Italian Game', side: 'w',
      line: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','c2c3','g8f6','d2d4'] },
    { id: 'ruy', name: 'Ruy Lopez', side: 'w',
      line: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1'] },
    { id: 'najdorf', name: 'Sicilian Najdorf', side: 'b',
      line: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','a7a6'] },
    { id: 'french', name: 'French Defence', side: 'b',
      line: ['e2e4','e7e6','d2d4','d7d5','b1c3','g8f6','c1g5','f8e7'] },
    { id: 'london', name: 'London System', side: 'w',
      line: ['d2d4','d7d5','g1f3','g8f6','c1f4','c7c5','e2e3','b8c6','c2c3'] },
    { id: 'vienna', name: 'Vienna Game', side: 'w',
      line: ['e2e4','e7e5','b1c3','g8f6','f2f4','d7d5','f4e5','f6e4'] },
    { id: 'scotch', name: 'Scotch Game', side: 'w',
      line: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4','f8c5','c1e3'] },
    { id: 'fourknights', name: 'Four Knights', side: 'w',
      line: ['e2e4','e7e5','g1f3','b8c6','b1c3','g8f6','f1b5','f8b4'] },
    { id: 'english', name: 'English Opening', side: 'w',
      line: ['c2c4','e7e5','b1c3','g8f6','g2g3','d7d5','c4d5','f6d5','f1g2'] },
    { id: 'dutch', name: 'Dutch Defence', side: 'b',
      line: ['d2d4','f7f5','g2g3','g8f6','f1g2','e7e6','g1f3','f8e7'] },
    { id: 'pirc', name: 'Pirc Defence', side: 'b',
      line: ['e2e4','d7d6','d2d4','g8f6','b1c3','g7g6','g1f3','f8g7'] },
    { id: 'modern', name: 'Modern Defence', side: 'b',
      line: ['e2e4','g7g6','d2d4','f8g7','b1c3','d7d6','g1f3','a7a6'] },
    { id: 'scandi', name: 'Scandinavian', side: 'b',
      line: ['e2e4','d7d5','e4d5','d8d5','b1c3','d5a5','d2d4','g8f6'] },
    { id: 'alekhine', name: 'Alekhine Defence', side: 'b',
      line: ['e2e4','g8f6','e4e5','f6d5','d2d4','d7d6','g1f3','c8g4'] },
    { id: 'qindian', name: "Queen's Indian", side: 'b',
      line: ['d2d4','g8f6','c2c4','e7e6','g1f3','b7b6','g2g3','c8b7','f1g2'] },
    { id: 'nimzo', name: 'Nimzo-Indian', side: 'b',
      line: ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4','e2e3','e8g8'] },
    { id: 'grunfeld', name: 'Gr\u00fcnfeld', side: 'b',
      line: ['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5','c4d5','f6d5'] },
    { id: 'benoni', name: 'Benoni', side: 'b',
      line: ['d2d4','g8f6','c2c4','c7c5','d4d5','e7e6','b1c3','e6d5','c4d5','d7d6'] },
    { id: 'tromp', name: 'Trompowsky', side: 'w',
      line: ['d2d4','g8f6','c1g5','e7e6','e2e4','h7h6','g5f6','d8f6'] },
    { id: 'colle', name: 'Colle System', side: 'w',
      line: ['d2d4','d7d5','g1f3','g8f6','e2e3','e7e6','f1d3','c7c5'] },
    { id: 'kgambit', name: "King's Gambit", side: 'w',
      line: ['e2e4','e7e5','f2f4','e5f4','g1f3','g7g5','f1c4','g5g4'] },
    { id: 'evans', name: 'Evans Gambit', side: 'w',
      line: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','b2b4','c5b4','c2c3','b4a5'] },
    { id: 'petrov', name: 'Petrov Defence', side: 'b',
      line: ['e2e4','e7e5','g1f3','g8f6','f3e5','d7d6','e5f3','f6e4'] },
    { id: 'twoknights', name: 'Two Knights Defence', side: 'b',
      line: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','f3g5','d7d5'] },
    { id: 'benko', name: 'Benko Gambit', side: 'b',
      line: ['d2d4','g8f6','c2c4','c7c5','d4d5','b7b5','c4b5','a7a6'] }
  ];

  const OPENING_BY_ID = {};
  for (const o of OPENINGS) OPENING_BY_ID[o.id] = o;

  /* ============================================================
     BOARD
     ============================================================ */
  function classify(el) {
    const cls = el.classList;
    for (const c of cls) if (/^[wb][pnbrqk]$/.test(c)) return { color: c[0], type: c[1] };
    if (cls.contains('white') || cls.contains('black')) {
      const color = cls.contains('white') ? 'w' : 'b';
      for (const c of cls) {
        if (['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].indexOf(c) >= 0) return { color: color, type: c[0] };
      }
    }
    return null;
  }

  function squareOf(el, rect, flipped) {
    const er = el.getBoundingClientRect();
    const size = rect.width / 8;
    if (!size) return null;
    let file = Math.floor((er.left + er.width / 2 - rect.left) / size);
    let rank = Math.floor((er.top + er.height / 2 - rect.top) / size);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    if (!flipped) rank = 7 - rank; else file = 7 - file;
    return { file: file, rank: rank };
  }

  const MOVE_LIST_SEL = ['.play-list', '.vertical-move-list', 'wc-move-list', '.move-list', '.tview2', 'rm6', '.l4x', '.moves'];
  const INITIAL_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

  function resolveBoardSide(forcedTurn, detectedTurn, placement) {
    if (placement === INITIAL_PLACEMENT) return 'w';
    return forcedTurn || detectedTurn || null;
  }

  function moveListEl() {
    for (const sel of MOVE_LIST_SEL) { const el = document.querySelector(sel); if (el) return el; }
    return null;
  }

  function countPlies() {
    const list = moveListEl();
    if (!list) return null;
    let n = list.querySelectorAll('[data-ply]').length;
    if (n) return n;
    n = list.querySelectorAll('move, wc-smooth-move, .node, .main-line-ply').length;
    if (n) return n;
    const txt = (list.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt) return null;
    const toks = txt.split(' ').filter(t => t && !/^\d+\.+$/.test(t) && /[a-h]|[NOBRQK]/.test(t));
    return toks.length || null;
  }

  const WHITE_CLOCK = '.clock-white, .rclock-white, [class*="clock-white"]';
  const BLACK_CLOCK = '.clock-black, .rclock-black, [class*="clock-black"]';

  function detectColorByClocks() {
    const w = document.querySelector(WHITE_CLOCK);
    const b = document.querySelector(BLACK_CLOCK);
    if (!w || !b) return null;
    const wr = w.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (!wr.height || !br.height) return null;
    if (Math.abs(wr.top - br.top) < 20) return null;
    return (wr.top + wr.height / 2) > (br.top + br.height / 2) ? 'w' : 'b';
  }

  function detectColorByOrientation(root) {
    let el = root, hops = 0;
    while (el && hops++ < 10) {
      if (el.classList) {
        if (el.classList.contains('flipped') || el.classList.contains('orientation-black')) return 'b';
        if (el.classList.contains('orientation-white')) return 'w';
      }
      if (el.hasAttribute && el.hasAttribute('flipped')) return 'b';
      el = el.parentElement;
    }
    if (document.body.classList.contains('flipped')) return 'b';
    if (document.querySelector('.orientation-black')) return 'b';
    if (document.querySelector('.orientation-white')) return 'w';
    return null;
  }

  function detectTurn() {
    const ply = countPlies();
    if (typeof ply === 'number' && ply > 0) return ply % 2 === 0 ? 'w' : 'b';
    const active = document.querySelector('.clock-player-turn, .rclock-turn, .running');
    if (active) {
      const probe = (active.className || '') + ' ' +
        Array.from(active.querySelectorAll('[class]')).map(e => e.className).join(' ');
      if (/clock-white|rclock-white/.test(probe)) return 'w';
      if (/clock-black|rclock-black/.test(probe)) return 'b';
    }
    return null;
  }

  const adapters = {
    chesscom: {
      board: () => document.querySelector('wc-chess-board') || document.querySelector('#board-single') || document.querySelector('.board'),
      pieces: root => Array.from(root.querySelectorAll('.piece'))
    },
    lichess: {
      board: () => document.querySelector('cg-board'),
      pieces: root => Array.from(root.querySelectorAll('piece'))
    },
    generic: {
      board: () => document.querySelector('cg-board') || document.querySelector('.board') || document.querySelector('[class*="chessboard"]'),
      pieces: root => Array.from(root.querySelectorAll('piece, .piece'))
    }
  };

  function pickAdapter() {
    const h = location.hostname;
    if (h.indexOf('chess.com') >= 0) return adapters.chesscom;
    if (h.indexOf('lichess.org') >= 0) return adapters.lichess;
    return adapters.generic;
  }

  const HOME_RIGHT = { 60: 3, 56: 2, 63: 1, 4: 12, 0: 8, 7: 4 };
  let prevFlat = '', prevRoot = null, prevPly = -1;
  let rightsMask = 0, halfmoveN = 0;

  function sq64(i) { return 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8)); }

  function rightsString(mask) {
    let s = '';
    if (mask & 1) s += 'K';
    if (mask & 2) s += 'Q';
    if (mask & 4) s += 'k';
    if (mask & 8) s += 'q';
    return s;
  }

  function inferRights(flat) {
    let r = 0;
    if (flat[60] === 'K') {
      if (flat[63] === 'R') r |= 1;
      if (flat[56] === 'R') r |= 2;
    }
    if (flat[4] === 'k') {
      if (flat[7] === 'r') r |= 4;
      if (flat[0] === 'r') r |= 8;
    }
    return r;
  }

  function track(flat, root, ply) {
    if (!prevFlat || prevRoot !== root || (ply >= 0 && prevPly >= 0 && ply < prevPly) ||
        (ply === 0 && prevPly !== 0)) {
      prevFlat = flat; prevRoot = root; prevPly = ply;
      rightsMask = inferRights(flat);
      halfmoveN = 0;
      return { rights: rightsString(rightsMask), ep: '', halfmove: 0 };
    }
    const prev = prevFlat;
    prevFlat = flat; prevPly = ply;
    if (prev === flat) return { rights: rightsString(rightsMask), ep: '', halfmove: halfmoveN };

    const ch = [];
    for (let i = 0; i < 64; i++) if (flat[i] !== prev[i]) ch.push(i);

    let captured = false, pawnMoved = false, epSq = -1;
    for (const i of ch) {
      const before = prev[i], after = flat[i];
      if (before !== '.' && after !== '.') {
        captured = true;
        rightsMask &= ~(HOME_RIGHT[i] || 0);
        continue;
      }
      if (before === '.') continue;
      if (before === 'K') rightsMask &= ~3;
      else if (before === 'k') rightsMask &= ~12;
      else if (before === 'R' || before === 'r') rightsMask &= ~(HOME_RIGHT[i] || 0);
      if (before === 'P' || before === 'p') pawnMoved = true;
    }

    if (captured) {
      halfmoveN = 0;
      for (const i of ch) if (prev[i] !== '.' && flat[i] === '.') rightsMask &= ~(HOME_RIGHT[i] || 0);
    } else halfmoveN++;
    if (pawnMoved) halfmoveN = 0;

    for (const i of ch) {
      const after = flat[i];
      if (after !== 'P' && after !== 'p') continue;
      if (prev[i] !== '.') continue;
      let o = -1;
      for (const j of ch) if (flat[j] === '.' && prev[j] === after) o = j;
      if (o < 0) continue;
      const r = 7 - Math.floor(i / 8), orr = 7 - Math.floor(o / 8);
      if (Math.abs(r - orr) === 2) epSq = (7 - (r + orr) / 2) * 8 + (i % 8);
    }

    return { rights: rightsString(rightsMask), ep: epSq >= 0 ? sq64(epSq) : '', halfmove: halfmoveN };
  }

  function readBoard(adapter, forcedTurn, ply) {
    const root = adapter.board();
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    if (rect.width < 120) return null;

    const flipped = detectColorByOrientation(root) === 'b';
    const grid = [];
    for (let i = 0; i < 8; i++) grid.push([null, null, null, null, null, null, null, null]);
    let found = 0;
    for (const el of adapter.pieces(root)) {
      const info = classify(el);
      if (!info) continue;
      const sq = squareOf(el, rect, flipped);
      if (!sq) continue;
      grid[sq.rank][sq.file] = info;
      found++;
    }
    if (found < 2) return null;

    const kings = { w: 0, b: 0 };
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = grid[r][f];
      if (p && p.type === 'k') kings[p.color]++;
    }
    if (kings.w !== 1 || kings.b !== 1) return null;

    let placement = '', flat = '';
    for (let r = 7; r >= 0; r--) {
      let run = 0;
      for (let f = 0; f < 8; f++) {
        const p = grid[r][f];
        if (!p) { run++; flat += '.'; continue; }
        if (run) { placement += run; run = 0; }
        const ch = p.color === 'w' ? p.type.toUpperCase() : p.type;
        placement += ch;
        flat += ch;
      }
      if (run) placement += run;
      if (r > 0) placement += '/';
    }

    const positionPly = placement === INITIAL_PLACEMENT ? 0 : typeof ply === 'number' ? ply : -1;
    const side = resolveBoardSide(forcedTurn, detectTurn(), placement);
    if (!side) return null;

    const at = (f, r) => grid[r] && grid[r][f];
    const is = (f, r, c, t) => { const p = at(f, r); return !!p && p.color === c && p.type === t; };
    if (!prevFlat || prevRoot !== root) {
      let rights = '';
      if (is(4, 0, 'w', 'k')) {
        if (is(7, 0, 'w', 'r')) rights += 'K';
        if (is(0, 0, 'w', 'r')) rights += 'Q';
      }
      if (is(4, 7, 'b', 'k')) {
        if (is(7, 7, 'b', 'r')) rights += 'k';
        if (is(0, 7, 'b', 'r')) rights += 'q';
      }
      rightsMask = inferRights(flat);
      if (rights) rightsMask = inferRights(flat);
    }

    const extra = track(flat, root, positionPly);

    return {
      fen: placement + ' ' + side + ' ' + (extra.rights || '-') + ' ' + (extra.ep || '-') + ' ' + extra.halfmove + ' 1',
      side: side, flipped: flipped, root: root, ply: positionPly, placement: placement,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      signature: [placement, side, extra.rights || '-', extra.ep || '-', positionPly, flipped ? 'b' : 'w'].join(' ')
    };
  }

  function squareCenter(rect, flipped, file, rank) {
    const size = rect.width / 8;
    const fx = flipped ? 7 - file : file;
    const ry = flipped ? rank : 7 - rank;
    return { x: rect.left + (fx + 0.5) * size, y: rect.top + (ry + 0.5) * size };
  }

  function detectTcByText() {
    const scopes = ['.game-info', '[class*="time-control"]', '.round__app', '.setup', 'rm6', '.rcontrols', '.clock-row'];
    for (const sel of scopes) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const t = (el.textContent || '').toLowerCase();
      if (/bullet|1\+0|2\+1|1\+1/.test(t)) return 'bullet';
      if (/blitz|3\+|5\+0|5\+2/.test(t)) return 'blitz';
      if (/rapid|10\+|15\+10|10 min/.test(t)) return 'rapid';
      if (/classical|30\+|60 min/.test(t)) return 'classical';
    }
    return null;
  }

  function detectTcByClock() {
    let max = 0;
    for (const e of document.querySelectorAll('.clock-white, .clock-black, .rclock-white, .rclock-black, .clock-time-monobar')) {
      const m = (e.textContent || '').trim().match(/^(\d{1,3}):(\d{2})/);
      if (m) max = Math.max(max, (+m[1]) * 60 + (+m[2]));
    }
    return max;
  }

  /* ============================================================
     MOVE RATINGS
     ============================================================ */
  const BOOK_PATH = 'M4 4.2h5.4a3 3 0 0 1 2.6 1.5 3 3 0 0 1 2.6-1.5H20v13.2h-5.4a2.2 2.2 0 0 0-2.6 2.1 2.2 2.2 0 0 0-2.6-2.1H4z';
  const FLAG_PATH = 'M5 3v18M5 4h11l-2 4 2 4H5';

  const RATINGS = {
    brilliant: { sym: '!!', fill: '#1baca4', fg: '#04211f', label: 'Brilliant' },
    great:     { sym: '!',  fill: '#5b8bae', fg: '#06131c', label: 'Great' },
    best:      { sym: '\u2605', fill: '#95bb4a', fg: '#101a06', label: 'Best' },
    excellent: { sym: '\u2713', fill: '#96bc4b', fg: '#101a06', label: 'Excellent' },
    good:      { sym: '\u2713', fill: '#8fa87f', fg: '#0e1409', label: 'Good' },
    book:      { sym: '', fill: '#a88865', fg: '#180f06', label: 'Book', icon: BOOK_PATH },
    opening:   { sym: '', fill: '#8b7ae0', fg: '#0d0a1c', label: 'Theory', icon: FLAG_PATH, stroke: true },
    forced:    { sym: '\u2192', fill: '#8d8f96', fg: '#101114', label: 'Forced' },
    inaccuracy:{ sym: '?!', fill: '#f7c631', fg: '#1b1403', label: 'Inaccuracy' },
    mistake:   { sym: '?',  fill: '#e58f2a', fg: '#1b1003', label: 'Mistake' },
    miss:      { sym: '\u2717', fill: '#ff7769', fg: '#1c0705', label: 'Miss' },
    blunder:   { sym: '??', fill: '#ca3431', fg: '#fff0ef', label: 'Blunder' }
  };

  function rate(res, loss, isMine, mine) {
    if (res.opening) return 'opening';
    if (res.only) return 'forced';
    if (res.book) return 'book';
    const persp = (mine === 'w' ? 1 : -1) * (isMine ? 1 : -1);
    const good = res.scoreCp * persp;
    const mateNow = res.mateIn * persp > 0;
    const mateWas = res.bestMateIn * persp > 0;
    if (mateWas && !mateNow) return 'miss';
    if (loss <= 12) {
      if (res.sacrifice && good >= 30) return 'brilliant';
      if (mateNow) return 'best';
      if (res.gap >= 200) return 'great';
      return 'best';
    }
    if (loss <= 25) return 'excellent';
    if (loss <= 60) return 'good';
    if (loss <= 120) return 'inaccuracy';
    if (loss <= 250) return 'mistake';
    return 'blunder';
  }

  function badgeHTML(kind) {
    const r = RATINGS[kind];
    if (!r) return '';
    if (r.icon) {
      const stroke = r.stroke ? ' stroke="' + r.fg + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"' : ' fill="' + r.fg + '"';
      return '<svg viewBox="0 0 24 24" width="11" height="11"><path d="' + r.icon + '"' + stroke + '/></svg>';
    }
    return r.sym;
  }

  /* ============================================================
     UI
     ============================================================ */
  const CSS = `
  :host{all:initial}
  .wrap{position:fixed;top:16px;right:16px;width:322px;z-index:2147483400;
  font-family:ui-sans-serif,-apple-system,"Segoe UI",Inter,sans-serif;color:#e7eeec;
  background:#101719;border:1px solid #293638;border-radius:15px;
  box-shadow:0 18px 48px rgba(0,0,0,.5);overflow:hidden;user-select:none}
  .wrap::before{content:"";position:absolute;top:0;left:16px;right:16px;height:2px;
  background:#c9f17a;border-radius:0 0 2px 2px}
  .bar{display:flex;align-items:center;gap:10px;padding:14px 15px 12px;cursor:grab;
  border-bottom:1px solid rgba(255,255,255,.065)}
  .mark{width:10px;height:10px;border-radius:3px;flex:none;background:#c9f17a}
  .title{font-size:12px;font-weight:750;letter-spacing:.01em;flex:1;color:#f2f6f2}
  .mini{all:unset;cursor:pointer;font-size:14px;line-height:1;padding:4px 7px;border-radius:7px;
  opacity:.45;color:#e9edf6;transition:.15s}
  .mini:hover{opacity:1;background:rgba(255,255,255,.08)}
  .body{padding:0 15px 15px;display:grid;gap:11px;max-height:calc(100vh - 36px);overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.14) transparent}
  .body.hide{display:none}
  .body::-webkit-scrollbar{width:5px}
  .body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:9px}
  .pills{display:flex;gap:5px;flex-wrap:wrap;padding:2px 0}
  .pill{font-size:9px;padding:3.5px 8px;border-radius:7px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.085);opacity:.68;font-weight:800;letter-spacing:.07em;text-transform:uppercase}
  .pill.warn{background:rgba(255,184,77,.13);border-color:rgba(255,184,77,.36);color:#ffcf8a;opacity:1}
  .pill.him{background:rgba(90,169,255,.13);border-color:rgba(90,169,255,.34);color:#9ecbff;opacity:1}
  .pill.theory{background:rgba(201,241,122,.1);border-color:rgba(201,241,122,.3);color:#d9f69d;opacity:1}
  .lbl{font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.52;font-weight:800}
  .lbl b{font-weight:800;opacity:.8}
  .rrow{display:flex;align-items:flex-end;gap:9px;margin-top:-1px}
  .rnum{font-size:31px;font-weight:760;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.035em;color:#d9f69d}
  .rtag{font-size:9.5px;opacity:.4;padding-bottom:3px;font-weight:700;letter-spacing:.04em}
  input[type=range]{-webkit-appearance:none;width:100%;height:4px;border-radius:99px;outline:none;
  background:#354342;box-shadow:none}
  input[type=range].voice{background:#354342}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;
  background:#c9f17a;border:3px solid #101719;cursor:grab;box-shadow:0 0 0 1px #c9f17a}
  .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:3px;border-radius:12px;
  background:#151f21;border:1px solid #293638}
  .seg button{all:unset;cursor:pointer;text-align:center;font-size:10px;font-weight:800;padding:6.5px 2px;
  border-radius:8px;opacity:.5;transition:.15s;letter-spacing:.02em}
  .seg button:hover{opacity:.8}
  .seg button.on{opacity:1;color:#162018;background:#c9f17a;box-shadow:none}
  .seg button.on.amber{background:#efbf69;color:#241d12;box-shadow:none}
  .chips{display:flex;gap:4px;flex-wrap:wrap}
  .chip{all:unset;cursor:pointer;font-size:10px;font-weight:800;padding:4px 8.5px;border-radius:8px;
  border:1px solid rgba(255,255,255,.095);opacity:.55;transition:.15s}
  .chip:hover{opacity:.85;border-color:rgba(255,255,255,.22)}
  .chip.on{opacity:1;background:rgba(201,241,122,.12);border-color:rgba(201,241,122,.45);color:#dcf6ad}
  .selwrap{position:relative}
  .selwrap::after{content:"";position:absolute;right:11px;top:50%;width:6px;height:6px;margin-top:-4px;
  border-right:1.6px solid rgba(255,255,255,.45);border-bottom:1.6px solid rgba(255,255,255,.45);
  transform:rotate(45deg);pointer-events:none}
  select{all:unset;box-sizing:border-box;width:100%;cursor:pointer;font-size:11px;font-weight:700;
  padding:9px 30px 9px 11px;border-radius:11px;color:#e9edf6;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);
  text-overflow:ellipsis;white-space:nowrap;overflow:hidden;transition:.15s}
  select:hover{background:rgba(255,255,255,.085);border-color:rgba(255,255,255,.16)}
  select:focus{border-color:rgba(201,241,122,.55)}
  select.on{background:rgba(201,241,122,.1);border-color:rgba(201,241,122,.38);color:#dcf6ad}
  option{background:#15171f;color:#e9edf6;font-weight:600}
  optgroup{background:#0e1016;color:#8b8f9e;font-weight:800;font-size:10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:1px 10px}
  .group{display:grid;gap:9px;padding:11px;border:1px solid #263436;border-radius:12px;background:#141e20}
  .group-title{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#92a4a0}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2.5px 0}
  .row span{font-size:11px;opacity:.68;letter-spacing:.01em}
  .sw{all:unset;cursor:pointer;width:30px;height:17px;border-radius:99px;background:rgba(255,255,255,.11);
  position:relative;transition:.16s;flex:none}
  .sw::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;
  background:#fff;transition:transform .16s;box-shadow:0 1px 3px rgba(0,0,0,.55)}
  .sw.on{background:#c9f17a}
  .sw.on::after{transform:translateX(13px)}
  .sw.amber.on{background:linear-gradient(90deg,#ffb84d,#ff7a59)}
  .step{display:flex;align-items:center;gap:5px}
  .sbtn{all:unset;cursor:pointer;width:21px;height:21px;border-radius:7px;text-align:center;line-height:21px;
  font-size:12px;background:rgba(255,255,255,.075);opacity:.75}
  .sbtn:hover{background:rgba(255,255,255,.16);opacity:1}
  .sval{font-size:11px;font-weight:800;min-width:32px;text-align:center;opacity:.82;font-variant-numeric:tabular-nums}
  .go{all:unset;cursor:pointer;text-align:center;padding:11px;border-radius:10px;font-size:12px;font-weight:800;
  background:#c9f17a;color:#182019;letter-spacing:.01em;box-shadow:none}
  .go:hover{background:#d7f79a}
  .go:active{transform:translateY(1px)}
  .go.alt{background:#243133;color:#e7eeec;box-shadow:none;font-weight:700}
  .go.alt:hover{background:#2c3b3d;filter:none}
  .go.hide,.hide{display:none}
  .status{font-size:10.5px;opacity:.46;min-height:14px;line-height:1.45}
  .status.err{color:#ff9a9a;opacity:.95}
  .status.play{color:#ffcf8a;opacity:.95;font-weight:700}
  .verdict{font-size:11.5px;line-height:1.5;padding:10px 12px;border-radius:12px;font-weight:600}
  .verdict.bad{background:linear-gradient(100deg,rgba(255,77,109,.17),rgba(255,122,89,.09));
  border:1px solid rgba(255,77,109,.4);color:#ffb8c5}
  .verdict.mild{background:rgba(255,184,77,.11);border:1px solid rgba(255,184,77,.32);color:#ffd79b}
  .verdict.ok{background:rgba(201,241,122,.08);border:1px solid rgba(201,241,122,.22);color:#d9f69d}
  .verdict.win{background:rgba(201,241,122,.12);
  border:1px solid rgba(201,241,122,.36);color:#d9f69d}
  .card{display:grid;gap:6px;padding:11px 12px;border-radius:12px;background:#172224;
  border:1px solid #2a393a}
  .card.punish{background:linear-gradient(100deg,rgba(255,184,77,.12),rgba(255,122,89,.05));
  border-color:rgba(255,184,77,.35)}
  .card.theory{background:rgba(201,241,122,.06);border-color:rgba(201,241,122,.28)}
  .mvrow{display:flex;align-items:center;gap:8px}
  .mv{font-size:20px;font-weight:800;letter-spacing:.01em}
  .badge{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;
  font-size:8.5px;font-weight:800;flex:none;line-height:1;letter-spacing:-.04em}
  .pl{font-size:8.5px;font-weight:800;padding:2.5px 7px;border-radius:99px;text-transform:uppercase;
  letter-spacing:.07em;background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.11);opacity:.72}
  .meta{font-size:10px;opacity:.42;font-variant-numeric:tabular-nums}
  .edge{height:3px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden;margin-top:2px}
  .edge i{display:block;height:100%;border-radius:99px;transition:width .3s,margin .3s;background:#c9f17a}
  .edge i.losing{background:linear-gradient(90deg,#ff4d6d,#ff9f43)}
  .sac{color:#ffb84d;font-weight:800;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
  .think{display:grid;gap:6px;padding:11px 12px;border-radius:12px;
  background:#141f22;border:1px solid #29383a}
  .think .why{font-size:11px;line-height:1.55;opacity:.86}
  .pv{font-size:10px;opacity:.46;font-variant-numeric:tabular-nums;line-height:1.55;word-break:break-word}
  .line{display:flex;justify-content:space-between;gap:8px;font-size:10px;font-variant-numeric:tabular-nums;
  opacity:.46;padding:2.5px 5px;border-radius:6px}
  .line.best{opacity:1;background:rgba(255,255,255,.055);font-weight:800}
  .mate{font-size:11px;font-weight:800;padding:9px 12px;border-radius:12px;
  background:rgba(201,241,122,.12);
  border:1px solid rgba(201,241,122,.36);color:#d9f69d}
  .log{display:grid;gap:1px;max-height:124px;overflow-y:auto;scrollbar-width:thin}
  .logrow{display:flex;align-items:center;gap:6px;font-size:10.5px;opacity:.76;font-variant-numeric:tabular-nums;padding:1.5px 2px}
  .logrow .n{opacity:.32;min-width:18px}
  .logrow .s{font-weight:800}
  .logrow .t{margin-left:auto;opacity:.36;font-size:9px}
  .sep{height:1px;background:rgba(255,255,255,.08);margin:1px 0}
  .setup{display:grid;gap:10px;padding-top:2px}
  .blurb{font-size:11px;opacity:.62;line-height:1.55}
  .eyebrow{font-size:9px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#c9f17a}
  .bgdot{width:7px;height:7px;border-radius:50%;background:#c9f17a;flex:none;transition:.2s}
  .bgdot.off{background:#596564}
  .bgdot.armed{background:#efbf69;animation:pulse 1.05s ease-in-out infinite}
  .bgdot.hot{background:#ff7880}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  `;

  function tierOf(r) {
    if (r < 300) return 'total beginner';
    if (r < 600) return 'novice';
    if (r < 900) return 'beginner';
    if (r < 1300) return 'casual';
    if (r < 1700) return 'club';
    if (r < 2100) return 'strong club';
    if (r < 2450) return 'expert';
    return 'master';
  }

  function playsLike(loss) {
    if (loss == null) return null;
    if (loss <= 10) return 2600;
    if (loss <= 25) return 2200;
    if (loss <= 50) return 1900;
    if (loss <= 90) return 1650;
    if (loss <= 150) return 1400;
    if (loss <= 250) return 1150;
    if (loss <= 400) return 900;
    if (loss <= 650) return 650;
    return 400;
  }

  function openingOptions() {
    const white = OPENINGS.filter(o => o.side === 'w').sort((a, b) => a.name.localeCompare(b.name));
    const black = OPENINGS.filter(o => o.side === 'b').sort((a, b) => a.name.localeCompare(b.name));
    let html = '<option value="none">No opening \u2014 free play</option>';
    html += '<optgroup label="As White">';
    for (const o of white) html += '<option value="' + o.id + '">' + o.name + '</option>';
    html += '</optgroup><optgroup label="As Black">';
    for (const o of black) html += '<option value="' + o.id + '">' + o.name + '</option>';
    html += '</optgroup>';
    return html;
  }

  const HTML = `
  <div class="wrap">
    <div class="bar" data-drag>
      <div class="mark"></div>
      <div class="title">Chess Coach</div>
      <div class="bgdot off" data-dot></div>
      <button class="mini" data-collapse title="Collapse">&#8211;</button>
    </div>
    <div class="body" data-body>
      <div class="setup" data-setup>
        <div class="eyebrow">YOUR PERSONAL CHESS COACH</div>
        <div class="blurb">Choose a playing strength to get move suggestions, explanations, and feedback as you play.</div>
        <div>
          <div class="lbl">Move strength</div>
          <div class="rrow"><div class="rnum" data-rnum>1200</div><div class="rtag" data-rtag>club</div></div>
          <input type="range" min="150" max="3000" step="25" value="1200" data-range>
        </div>
        <button class="go" data-start>Start coaching</button>
      </div>
      <div class="setup hide" data-main>
        <div class="pills"><span class="pill" data-tc>Format ?</span><span class="pill" data-side>Turn ?</span><span class="pill theory hide" data-theory></span></div>
        <div class="group">
          <div>
            <div class="lbl">Move strength</div>
            <div class="rrow"><div class="rnum" data-rnum2>1200</div><div class="rtag" data-rtag2>club</div></div>
            <input type="range" min="150" max="3000" step="25" value="1200" data-range2>
          </div>
          <div class="chips">
            <button class="chip" data-preset="300">300</button>
            <button class="chip" data-preset="600">600</button>
            <button class="chip" data-preset="1000">1000</button>
            <button class="chip" data-preset="1400">1400</button>
            <button class="chip" data-preset="1800">1800</button>
            <button class="chip" data-preset="2200">2200</button>
          </div>
          <div>
            <div class="lbl">Coach voice <b data-vtag></b></div>
            <input type="range" class="voice" min="150" max="3000" step="25" value="1200" data-voice>
          </div>
        </div>
        <div class="group">
          <div class="group-title">Opening and play</div>
          <div>
            <div class="lbl">Opening</div>
            <div class="selwrap"><select data-opening></select></div>
          </div>
          <div>
            <div class="lbl">Auto play</div>
            <div class="seg">
              <button data-amode="off">Off</button>
              <button data-amode="strong">Strong</button>
              <button class="amber" data-amode="all">Whole game</button>
            </div>
            <div class="blurb">Strong plays book moves and clear tactics; Whole game plays every turn.</div>
          </div>
          <div class="row"><span>Take every win</span><button class="sw amber on" data-punish></button></div>
          <div class="row"><span>Playing as</span>
            <div class="step">
              <button class="chip" data-color="auto">Auto</button>
              <button class="chip" data-color="w">White</button>
              <button class="chip" data-color="b">Black</button>
            </div>
          </div>
          <div class="row"><span>Depth</span>
            <div class="step">
              <button class="sbtn" data-dminus>&#8211;</button>
              <div class="sval" data-dval>Auto</div>
              <button class="sbtn" data-dplus>+</button>
            </div>
          </div>
        </div>
        <div class="group">
          <div class="group-title">Coach options</div>
          <div class="grid2">
            <div class="row"><span>Arrow</span><button class="sw on" data-auto></button></div>
            <div class="row"><span>Both sides</span><button class="sw on" data-both></button></div>
            <div class="row"><span>Rate moves</span><button class="sw on" data-rate></button></div>
            <div class="row"><span>Reasoning</span><button class="sw on" data-reason></button></div>
            <div class="row"><span>Sac flair</span><button class="sw on" data-sac></button></div>
            <div class="row"><span>Deep scan</span><button class="sw" data-deep></button></div>
            <div class="row"><span>Evaluation</span><button class="sw on" data-eval></button></div>
            <div class="row"><span>Auto power</span><button class="sw on" data-power></button></div>
            <div class="row"><span>Keep awake</span><button class="sw on" data-awake></button></div>
          </div>
        </div>
        <button class="go" data-now>Analyse now</button>
        <button class="go alt hide" data-now2>Play it now</button>
        <div class="mate hide" data-mate></div>
        <div class="verdict hide" data-verdict></div>
        <div class="card hide" data-read>
          <div class="mvrow"><div class="badge" data-badge></div><div class="mv" data-mv>&#8211;</div><div class="pl" data-pl></div></div>
          <div class="meta" data-meta></div>
          <div class="edge"><i data-edge style="width:50%"></i></div>
        </div>
        <div class="think hide" data-think>
          <div class="why" data-why></div>
          <div class="pv" data-pv></div>
          <div data-lines></div>
        </div>
        <div class="log hide" data-log></div>
        <div class="status" data-status>Waiting for a board&#8230;</div>
      </div>
    </div>
  </div>`;

  function createUI(settings, handlers) {
    const host = document.createElement('div');
    host.id = 'vcc-host';
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483400;';
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    const box = document.createElement('div');
    box.innerHTML = HTML;
    root.appendChild(box);
    box.querySelector('.wrap').style.pointerEvents = 'auto';

    const $ = s => root.querySelector(s);
    const setup = $('[data-setup]'), main = $('[data-main]'), body = $('[data-body]');
    const range = $('[data-range]'), range2 = $('[data-range2]'), voice = $('[data-voice]');
    const status = $('[data-status]'), read = $('[data-read]'), verdict = $('[data-verdict]');
    const think = $('[data-think]'), why = $('[data-why]'), lines = $('[data-lines]'), pvEl = $('[data-pv]');
    const mv = $('[data-mv]'), meta = $('[data-meta]'), pl = $('[data-pl]'), dot = $('[data-dot]');
    const badge = $('[data-badge]'), log = $('[data-log]'), mateEl = $('[data-mate]'), edge = $('[data-edge]');
    const tcTag = $('[data-tc]'), sideTag = $('[data-side]'), dval = $('[data-dval]'), vtag = $('[data-vtag]');
    const now2 = $('[data-now2]'), sel = $('[data-opening]'), theory = $('[data-theory]');

    sel.innerHTML = openingOptions();
    sel.value = settings.opening || 'none';

    function paintRating(v) {
      const t = tierOf(v);
      $('[data-rnum]').textContent = v; $('[data-rtag]').textContent = t;
      $('[data-rnum2]').textContent = v; $('[data-rtag2]').textContent = t;
      root.querySelectorAll('.chip[data-preset]').forEach(c => c.classList.toggle('on', +c.dataset.preset === v));
    }
    paintRating(settings.rating);
    range.value = settings.rating; range2.value = settings.rating;

    const onRating = v => { settings.rating = v; paintRating(v); handlers.rating(v); };
    range.addEventListener('input', e => onRating(+e.target.value));
    range2.addEventListener('input', e => onRating(+e.target.value));
    root.querySelectorAll('[data-preset]').forEach(c =>
      c.addEventListener('click', () => { onRating(+c.dataset.preset); range2.value = settings.rating; }));

    function paintVoice(v) { vtag.textContent = '\u00b7 ' + tierOf(v); voice.value = v; }
    paintVoice(settings.coachRating);
    voice.addEventListener('input', e => { settings.coachRating = +e.target.value; paintVoice(settings.coachRating); handlers.save(); });

    function paintOpening() {
      sel.classList.toggle('on', settings.opening !== 'none');
      sel.value = settings.opening;
    }
    paintOpening();
    sel.addEventListener('change', () => {
      settings.opening = sel.value;
      paintOpening();
      handlers.save();
      handlers.openingChange();
      handlers.gesture();
    });

    function paintColor() {
      root.querySelectorAll('[data-color]').forEach(c => c.classList.toggle('on', c.dataset.color === settings.myColor));
      sideTag.textContent = 'You ' + (settings.myColor === 'auto' ? 'auto' : settings.myColor === 'w' ? 'white' : 'black');
    }
    paintColor();
    root.querySelectorAll('[data-color]').forEach(c => c.addEventListener('click', () => {
      settings.myColor = c.dataset.color; paintColor(); handlers.save(); handlers.reset();
    }));

    function paintMode() {
      root.querySelectorAll('[data-amode]').forEach(c => c.classList.toggle('on', c.dataset.amode === settings.autoMode));
    }
    paintMode();
    root.querySelectorAll('[data-amode]').forEach(c => c.addEventListener('click', () => {
      settings.autoMode = c.dataset.amode;
      paintMode();
      handlers.save();
      handlers.modeChange();
    }));

    function paintDepth() { dval.textContent = settings.depth > 0 ? String(settings.depth) : 'Auto'; }
    paintDepth();
    $('[data-dplus]').addEventListener('click', () => { settings.depth = Math.min(20, (settings.depth || 0) + 1); paintDepth(); handlers.save(); });
    $('[data-dminus]').addEventListener('click', () => { settings.depth = settings.depth <= 1 ? 0 : settings.depth - 1; paintDepth(); handlers.save(); });

    function toggle(sel2, key, cb) {
      const el = $(sel2);
      el.classList.toggle('on', !!settings[key]);
      el.addEventListener('click', () => {
        settings[key] = !settings[key];
        el.classList.toggle('on', settings[key]);
        handlers.save();
        if (cb) cb(settings[key]);
      });
    }
    toggle('[data-auto]', 'auto', on => { if (on) handlers.autoOn(); });
    toggle('[data-both]', 'bothSides', () => handlers.autoOn());
    toggle('[data-rate]', 'ratings', () => { log.classList.toggle('hide', !settings.ratings); handlers.autoOn(); });
    toggle('[data-reason]', 'reasoning', () => handlers.autoOn());
    toggle('[data-sac]', 'sac', () => handlers.save());
    toggle('[data-deep]', 'deep', () => handlers.autoOn());
    toggle('[data-eval]', 'showEval', v => { read.style.display = v ? '' : 'none'; });
    toggle('[data-power]', 'autoPower', () => handlers.autoOn());
    toggle('[data-punish]', 'punish', () => handlers.autoOn());
    toggle('[data-awake]', 'keepAwake', v => handlers.awake(v));

    $('[data-start]').addEventListener('click', () => {
      settings.calibrated = true; handlers.save();
      setup.classList.add('hide'); main.classList.remove('hide');
      handlers.autoOn();
      handlers.gesture();
    });
    root.querySelectorAll('[data-amode]').forEach(c => c.addEventListener('click', () => handlers.gesture()));
    $('[data-now]').addEventListener('click', () => { handlers.cancelAuto(); handlers.analyze(); });
    now2.addEventListener('click', () => handlers.playNow());
    $('[data-collapse]').addEventListener('click', () => body.classList.toggle('hide'));

    let drag = null;
    const bar = $('[data-drag]'), wrap = $('.wrap');
    bar.addEventListener('pointerdown', e => {
      const r = wrap.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', e => {
      if (!drag) return;
      wrap.style.left = Math.max(0, e.clientX - drag.dx) + 'px';
      wrap.style.top = Math.max(0, e.clientY - drag.dy) + 'px';
      wrap.style.right = 'auto';
    });
    bar.addEventListener('pointerup', () => { drag = null; });

    if (settings.calibrated) { setup.classList.add('hide'); main.classList.remove('hide'); }
    if (settings.showEval === false) read.style.display = 'none';
    if (!settings.ratings) log.classList.add('hide');

    return {
      setStatus: (t, isErr) => {
        status.textContent = t;
        status.classList.toggle('err', !!isErr);
        status.classList.toggle('play', !isErr && /^Auto /.test(t));
      },
      setLive: on => dot.classList.toggle('off', !on),
      setArmed: on => { dot.classList.toggle('armed', !!on); if (on) dot.classList.remove('off'); },
      setHot: on => dot.classList.toggle('hot', !!on),
      setTheory(name) {
        if (!name) { theory.classList.add('hide'); return; }
        theory.classList.remove('hide');
        theory.textContent = name;
      },
      setTc(v) {
        const n = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', unknown: 'Format ?' };
        tcTag.textContent = n[v] || 'Format ?';
        tcTag.classList.toggle('warn', v === 'unknown');
      },
      setTurn(turn, mine) {
        if (!turn) { sideTag.textContent = 'Turn ?'; sideTag.classList.add('warn'); return; }
        const mineNow = mine ? turn === mine : false;
        sideTag.textContent = mineNow ? 'Your move' : 'His move';
        sideTag.classList.remove('warn');
        sideTag.classList.toggle('him', !mineNow);
      },
      showResult(res, mine, kind, punish) {
        read.classList.remove('hide');
        read.classList.toggle('punish', !!punish);
        read.classList.toggle('theory', !!res.opening);
        const r = RATINGS[kind];
        if (settings.ratings && r) {
          badge.style.display = '';
          badge.innerHTML = badgeHTML(kind);
          badge.style.background = r.fill;
          badge.style.color = r.fg;
          badge.title = r.label;
        } else badge.style.display = 'none';
        mv.innerHTML = res.san + (res.sacrifice ? ' <span class="sac">sac</span>' : '');
        const rl = playsLike(res.loss);
        pl.textContent = settings.ratings && r ? r.label : rl ? '\u2248' + rl : '';
        const cp = res.scoreCp / 100;
        const ev = (cp > 0 ? '+' : '') + cp.toFixed(2);
        meta.textContent = settings.showEval === false ? 'depth ' + res.depth : 'eval ' + ev + ' \u00b7 depth ' + res.depth;
        const pct = Math.max(6, Math.min(94, 50 + cp * 6));
        edge.style.width = pct + '%';
        edge.classList.toggle('losing', cp < -0.2);
      },
      clearResult() { read.classList.add('hide'); think.classList.add('hide'); },
      showReason(text, res) {
        if (!settings.reasoning || !text) { think.classList.add('hide'); return; }
        think.classList.remove('hide');
        why.textContent = text;
        pvEl.textContent = res.pv && res.pv.length > 1 ? 'line: ' + res.pv.slice(0, 9).join(' ') : '';
        lines.innerHTML = '';
        for (const ln of (res.lines || [])) {
          const row = document.createElement('div');
          row.className = 'line' + (ln.san === res.san ? ' best' : '');
          const a = document.createElement('span'); a.textContent = ln.san;
          const b = document.createElement('span'); b.className = 'e';
          const c = ln.cp / 100;
          b.textContent = (c > 0 ? '+' : '') + c.toFixed(2);
          row.appendChild(a); row.appendChild(b);
          lines.appendChild(row);
        }
      },
      showMate(text) {
        if (!text) { mateEl.classList.add('hide'); return; }
        mateEl.classList.remove('hide');
        mateEl.textContent = text;
      },
      showVerdict(text, kind) {
        if (!text) { verdict.classList.add('hide'); return; }
        verdict.className = 'verdict ' + (kind || 'ok');
        verdict.textContent = text;
      },
      showPlayNow(on) { now2.classList.toggle('hide', !on); },
      addLog(san, kind, mine, num) {
        if (!settings.ratings) return;
        const r = RATINGS[kind];
        const row = document.createElement('div');
        row.className = 'logrow';
        const n = document.createElement('span'); n.className = 'n'; n.textContent = num + '.';
        const s = document.createElement('span'); s.className = 's'; s.textContent = san;
        row.appendChild(n);
        if (r) {
          const b = document.createElement('span');
          b.className = 'badge'; b.innerHTML = badgeHTML(kind);
          b.style.background = r.fill; b.style.color = r.fg;
          row.appendChild(b);
        }
        const t = document.createElement('span'); t.className = 't'; t.textContent = mine ? 'you' : 'him';
        row.appendChild(t);
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
        while (log.children.length > 26) log.removeChild(log.firstChild);
      },
      clearLog() { log.innerHTML = ''; }
    };
  }

  /* ============================================================
     OVERLAY
     ============================================================ */
  function createOverlay() {
    const layer = document.createElement('div');
    layer.id = 'vcc-overlay';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483300;';
    document.documentElement.appendChild(layer);
    const SVGNS = 'http://www.w3.org/2000/svg';
    const PALETTE = {
      mine: ['#7c5cff', '#21d4a8'],
      his: ['#4d7cff', '#5aa9ff'],
      sac: ['#ff7a59', '#ffb84d'],
      punish: ['#ff9f43', '#ff4d6d'],
      theory: ['#8b7ae0', '#c8bcff']
    };

    return {
      clear() { layer.innerHTML = ''; },
      draw(from, to, rect, flipped, label, kind, badgeKind) {
        layer.innerHTML = '';
        if (!rect || !rect.width) return;
        const pal = PALETTE[kind] || PALETTE.mine;
        const accent2 = pal[0], accent = pal[1];
        const a = squareCenter(rect, flipped, from.file, from.rank);
        const b = squareCenter(rect, flipped, to.file, to.rank);
        const size = rect.width / 8;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;
        const pad = size * 0.33;
        const sx = a.x + ux * pad, sy = a.y + uy * pad;
        const ex = b.x - ux * pad * 1.4, ey = b.y - uy * pad * 1.4;
        const bow = len * 0.075;
        const mx = (sx + ex) / 2 - uy * bow, my = (sy + ey) / 2 + ux * bow;
        const head = size * 0.27;
        const tipX = b.x - ux * pad * 0.45, tipY = b.y - uy * pad * 0.45;
        const hx = tipX - ux * head, hy = tipY - uy * head;
        const px = -uy * head * 0.6, py = ux * head * 0.6;

        const svg = document.createElementNS(SVGNS, 'svg');
        svg.setAttribute('width', String(window.innerWidth));
        svg.setAttribute('height', String(window.innerHeight));
        svg.style.cssText = 'position:absolute;inset:0;overflow:visible;';
        svg.innerHTML =
          '<defs>' +
          '<linearGradient id="vcc-g" x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '" gradientUnits="userSpaceOnUse">' +
          '<stop offset="0" stop-color="' + accent2 + '"/><stop offset="1" stop-color="' + accent + '"/></linearGradient>' +
          '<filter id="vcc-glow" x="-50%" y="-50%" width="200%" height="200%">' +
          '<feGaussianBlur stdDeviation="' + (size * 0.13) + '" result="b"/>' +
          '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
          '<circle cx="' + a.x + '" cy="' + a.y + '" r="' + (size * 0.17) + '" fill="none" stroke="' + accent2 + '" stroke-width="2.4" opacity=".82"/>' +
          '<path d="M ' + sx + ' ' + sy + ' Q ' + mx + ' ' + my + ' ' + ex + ' ' + ey + '" fill="none" stroke="' + accent2 + '" stroke-width="' +
          (size * 0.2) + '" stroke-linecap="round" opacity=".3"/>' +
          '<path d="M ' + sx + ' ' + sy + ' Q ' + mx + ' ' + my + ' ' + ex + ' ' + ey + '" fill="none" stroke="url(#vcc-g)" stroke-width="' +
          (size * 0.135) + '" stroke-linecap="round" filter="url(#vcc-glow)" opacity=".97"/>' +
          '<path d="M ' + sx + ' ' + sy + ' Q ' + mx + ' ' + my + ' ' + ex + ' ' + ey + '" fill="none" stroke="#fff" stroke-width="' +
          (size * 0.028) + '" stroke-linecap="round" opacity=".6"/>' +
          '<polygon points="' + tipX + ',' + tipY + ' ' + (hx + px) + ',' + (hy + py) + ' ' + (hx - px) + ',' + (hy - py) + '" fill="' + accent + '" filter="url(#vcc-glow)"/>' +
          '<rect x="' + (b.x - size * 0.58) + '" y="' + (b.y - size * 0.58) + '" width="' + (size * 1.16) + '" height="' + (size * 1.16) +
          '" rx="' + (size * 0.18) + '" fill="none" stroke="' + accent + '" stroke-width="2.4" opacity=".65"/>';

        if (badgeKind && RATINGS[badgeKind]) {
          const r = RATINGS[badgeKind];
          const bx = b.x + size * 0.36, by = b.y - size * 0.36, br = size * 0.23;
          svg.innerHTML += '<circle cx="' + bx + '" cy="' + by + '" r="' + br + '" fill="' + r.fill + '" stroke="rgba(0,0,0,.55)" stroke-width="1.7"/>';
          if (r.icon) {
            const s = (br * 1.5) / 24;
            const stroke = r.stroke
              ? ' stroke="' + r.fg + '" stroke-width="2.2" stroke-linecap="round" fill="none"'
              : ' fill="' + r.fg + '"';
            svg.innerHTML += '<g transform="translate(' + (bx - 12 * s) + ',' + (by - 12 * s) + ') scale(' + s + ')">' +
              '<path d="' + r.icon + '"' + stroke + '/></g>';
          } else {
            const fs = r.sym.length > 1 ? br * 0.85 : br * 1.25;
            svg.innerHTML += '<text x="' + bx + '" y="' + by + '" text-anchor="middle" dominant-baseline="central" ' +
              'font-family="ui-sans-serif,system-ui,sans-serif" font-weight="800" font-size="' + fs + '" fill="' + r.fg + '">' + r.sym + '</text>';
          }
        }

        const path = svg.querySelectorAll('path')[1];
        if (path && path.getTotalLength) {
          const plen = path.getTotalLength();
          path.style.strokeDasharray = String(plen);
          path.style.strokeDashoffset = String(plen);
          if (path.animate) path.animate([{ strokeDashoffset: plen }, { strokeDashoffset: 0 }],
            { duration: 175, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
        }
        if (label) {
          const f = document.createElement('div');
          f.textContent = label;
          f.style.cssText = 'position:absolute;left:' + (b.x + size * 0.5) + 'px;top:' + (b.y - size * 0.94) + 'px;font:800 ' +
            Math.max(11, size * 0.26) + 'px ui-sans-serif,system-ui,sans-serif;color:#070a0d;background:' + accent +
            ';padding:2px 7px;border-radius:7px;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.6);';
          svg.appendChild(f);
        }
        layer.appendChild(svg);
      }
    };
  }

  /* ============================================================
     COACH VOICE
     ============================================================ */
  const NAME = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };
  const PROMO_LETTER = { 5: 'q', 4: 'r', 3: 'b', 2: 'n' };
  const PROMO_WORD = { 5: 'queen', 4: 'rook', 3: 'bishop', 2: 'knight' };

  function reasonFor(res, voice) {
    const d = res.detail || {};
    const bits = [];
    if (d.mate) bits.push(voice < 900 ? 'That is checkmate.' : 'Mate.');
    else if (d.promo) bits.push('Promote to a ' + NAME[d.promo] + '.');
    else if (d.cap) bits.push(voice < 900 ? 'Take the ' + NAME[d.cap] + ', it is free.' : 'Wins the ' + NAME[d.cap] + '.');
    if (d.sac) bits.push(voice < 900 ? 'You lose a piece on purpose. It works out.' : 'Sacrifice, the follow-up is worth more.');
    if (d.check && !d.mate) bits.push(voice < 900 ? 'Check, he has to answer.' : 'Forces a reply.');
    if (d.castle) bits.push(voice < 900 ? 'Castle so your king is safe.' : 'Castles, king tucked away.');
    if (d.develop && !d.castle) bits.push(voice < 900 ? 'Get the piece out to a better square.' : 'Development.');
    if (d.center && !d.cap) bits.push(voice < 900 ? 'Take the middle squares.' : 'Seizes the centre.');
    if (d.hangs) bits.push(voice < 900 ? 'Careful, he can take that piece.' : 'Piece can be taken, but it holds.');
    if (!bits.length) bits.push(voice < 900 ? 'Quiet move, nothing to take yet.' : 'Improving move, no immediate tactic.');
    if (voice >= 1700) {
      const cp = res.scoreCp / 100;
      bits.unshift((cp > 0 ? '+' : '') + cp.toFixed(2) + '.');
    }
    return bits.join(' ');
  }

  const VERDICTS = {
    huge: ['Holy blunder bro \uD83D\uDE2D he handed it over.', 'That is a howler. Free material.', 'Total blunder, punish it.'],
    bad: ['Big blunder. He cracked.', 'Blunder. You are winning now.', 'He gave that away.'],
    mistake: ['Mistake from him. Pounce.', 'That is a mistake, tactic incoming.'],
    inacc: ['Inaccuracy. Slight edge for you.', 'Loose move from him.'],
    meh: ['Playable, nothing special.', 'Ordinary move.'],
    good: ['Solid from him.', 'Reasonable, nothing given.']
  };

  const adapter = pickAdapter();
  const settings = {
    rating: 1200, coachRating: 1200, auto: true, autoMode: 'off', bothSides: true, ratings: true,
    reasoning: true, sac: true, deep: false, showEval: true, autoPower: true, punish: true, keepAwake: true,
    opening: 'none', calibrated: false, myColor: 'auto', depth: 0, perHost: {}
  };

  let ui, overlay, worker = null, workerUrl = null, engineLoading = false, engineGeneration = 0;
  let queuedThink = null, localEngine = null, busy = false, lastSig = '', pending = null;
  let myColor = null, tc = 'unknown', tcMax = 0, boardEl = null, oppScore = null, oppFen = null;
  let retryFlip = false, moveNum = 0, hidden = false;
  let ticking = false, pulseOn = false;

  let aPhase = 'idle';
  let autoDue = 0, playUntil = 0, playTries = 0, armedSig = '', playSig = '', playPosition = '';
  let queued = null;

  function activeLine() {
    const o = OPENING_BY_ID[settings.opening];
    return o ? o.line : null;
  }

  let actx = null, aosc = null;
  function awake(on) {
    try {
      if (on) {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        if (!aosc) {
          aosc = actx.createOscillator();
          const g = actx.createGain();
          g.gain.value = 0.002;
          aosc.frequency.value = 55;
          aosc.connect(g); g.connect(actx.destination); aosc.start();
        }
      } else if (aosc) {
        try { aosc.stop(); } catch (e) {}
        try { aosc.disconnect(); } catch (e) {}
        aosc = null;
        if (actx) { try { actx.close(); } catch (e) {} actx = null; }
      }
    } catch (e) {}
  }

  function keepAwakeGesture() {
    if (!settings.keepAwake) return;
    awake(true);
  }

  function hostKey() { return location.hostname.replace(/^www\./, ''); }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { chrome.storage.local.set({ vccSettings: settings }); } catch (e) {} }, 250);
  }

  function cancelAuto() {
    aPhase = 'idle';
    autoDue = 0; playUntil = 0;
    queued = null;
    if (ui) { ui.showPlayNow(false); ui.setArmed(false); ui.setHot(false); }
  }

  function stopEngine() {
    engineGeneration++;
    engineLoading = false;
    queuedThink = null;
    if (worker) { try { worker.terminate(); } catch (e) {} }
    worker = null; pulseOn = false;
    if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null; }
  }

  function startEngine() {
    if (worker || engineLoading) return;
    engineLoading = true;
    const generation = ++engineGeneration;
    try {
      const jsUrl = chrome.runtime.getURL('stockfish-19-lite-single.js');
      const readAsset = url => fetch(url).then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' loading ' + url);
        return response.text();
      });
      Promise.all([readAsset(chrome.runtime.getURL('stockfish-worker.js')), readAsset(jsUrl)]).then(files => {
        if (generation !== engineGeneration) return;
        const engineSource = files[1].split('self.location.href').join(JSON.stringify(jsUrl))
          .split('"stockfish.wasm"').join('"stockfish-19-lite-single.wasm"');
        if (engineSource === files[1] || engineSource.indexOf('stockfish-19-lite-single.wasm') < 0) {
          throw new Error('Could not configure Stockfish WebAssembly path.');
        }
        const workerSource = engineSource + '\n' + files[0];
        const url = URL.createObjectURL(new Blob([workerSource], { type: 'application/javascript' }));
        let created;
        try { created = new Worker(url); }
        catch (error) { URL.revokeObjectURL(url); throw error; }
        workerUrl = url;
        worker = created;
        engineLoading = false;
        created.onmessage = onWorker;
        created.onerror = event => {
          if (worker !== created) return;
          stopEngine();
          onWorker({ data: { ok: false, error: 'Stockfish worker failed to start: ' + (event.message || 'unknown error') } });
        };
        if (settings.auto) pulse(true);
        if (queuedThink) {
          const request = queuedThink;
          queuedThink = null;
          created.postMessage(request);
        }
      }).catch(error => {
        if (generation !== engineGeneration) return;
        engineLoading = false;
        queuedThink = null;
        if (worker) stopEngine();
        if (pending) onWorker({ data: { ok: false, error: 'Could not load Stockfish: ' + String(error && error.message || error) } });
      });
    } catch (error) {
      if (generation !== engineGeneration) return;
      engineLoading = false;
      queuedThink = null;
      if (pending) onWorker({ data: { ok: false, error: 'Could not load Stockfish: ' + String(error && error.message || error) } });
    }
  }

  function pulse(on) {
    if (!worker || on === pulseOn) return;
    pulseOn = on;
    try { worker.postMessage({ type: on ? 'pulse-start' : 'pulse-stop' }); } catch (e) { pulseOn = false; }
  }

  function think(state, rating, sacBias, depth, tcm, deep, clock, boost, punish) {
    const line = activeLine();
    const ply = state.ply;
    const request = { type: 'analyze', fen: state.fen, rating: rating, sacBias: sacBias, depth: depth,
                      tc: tcm, deep: !!deep, clock: clock || 0, boost: !!boost,
                      punish: !!punish, line: line, ply: ply };
    if (!worker) { queuedThink = request; startEngine(); return; }
    try {
      worker.postMessage(request);
    } catch (err) {
      stopEngine();
      onWorker({ data: { ok: false, error: String(err && err.message || err) } });
    }
  }

  function teardown() {
    stopEngine();
    const h = document.getElementById('vcc-host');
    if (h) h.remove();
    const o = document.getElementById('vcc-overlay');
    if (o) o.remove();
  }

  function boot() {
    teardown();
    ui = createUI(settings, {
      rating: v => { settings.perHost[hostKey()] = v; save(); schedule(50); },
      save: save,
      analyze: () => run(true),
      playNow: () => { if (aPhase === 'armed') { autoDue = Date.now(); tick(); } },
      gesture: () => { if (settings.autoMode !== 'off') { awake(settings.keepAwake); pulse(true); } },
      modeChange: () => {
        if (settings.autoMode === 'off') { cancelAuto(); awake(false); pulse(false); }
        else { awake(settings.keepAwake); pulse(true); lastSig = ''; schedule(50); }
      },
      openingChange: () => { lastSig = ''; schedule(60); },
      awake: on => awake(on && settings.autoMode !== 'off'),
      autoOn: () => { lastSig = ''; schedule(90); },
      cancelAuto: cancelAuto,
      reset: () => { myColor = null; lastSig = ''; schedule(60); }
    });
    overlay = createOverlay();
    ui.setStatus('Looking for a board\u2026');
    startEngine();
    linkBackground();
    if (settings.autoMode !== 'off') pulse(true);
    tick();
  }

  let scheduleTimer = null;
  function schedule(ms) {
    clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(tick, ms);
  }

  function retryPlayback(signature) {
    playTries++;
    aPhase = 'idle';
    if (playTries > 3) {
      ui.setStatus('Could not play automatically.', true);
      lastSig = '';
      cancelAuto();
      return false;
    }
    aPhase = 'armed';
    autoDue = Date.now() + 420;
    armedSig = signature;
    ui.setStatus('Retrying\u2026');
    return true;
  }

  function resolveColor(state) {
    if (settings.myColor === 'w' || settings.myColor === 'b') return settings.myColor;
    if (myColor) return myColor;
    const byClock = detectColorByClocks();
    if (byClock) { myColor = byClock; return myColor; }
    const byOrient = detectColorByOrientation(state.root);
    if (byOrient) { myColor = byOrient; return myColor; }
    return null;
  }

  function updateTc() {
    if (tc !== 'unknown') { ui.setTc(tc); return; }
    const byText = detectTcByText();
    if (byText) { tc = byText; ui.setTc(tc); return; }
    const secs = detectTcByClock();
    if (secs > tcMax) tcMax = secs;
    if (tcMax > 0) {
      if (tcMax < 180) tc = 'bullet';
      else if (tcMax < 600) tc = 'blitz';
      else if (tcMax < 1500) tc = 'rapid';
      else tc = 'classical';
    }
    ui.setTc(tc);
  }

  function clockLeft() {
    let low = Infinity;
    for (const e of document.querySelectorAll('.clock-white, .clock-black, .rclock-white, .rclock-black')) {
      const m = (e.textContent || '').trim().match(/^(\d{1,3}):(\d{2})/);
      if (m) low = Math.min(low, (+m[1]) * 60 + (+m[2]));
    }
    return low === Infinity ? 0 : low;
  }

  function watchdog() {
    if (!busy || !pending || Date.now() - pending.at <= 20000) return;
    busy = false;
    pending = null;
    lastSig = '';
    ui.setStatus('Stockfish stalled, restarting\u2026', true);
    stopEngine();
    startEngine();
  }

  function tick() {
    if (!hidden && !document.getElementById('vcc-host') && ui) { boot(); return; }
    if (!settings.auto || ticking) return;
    ticking = true;
    try {
      watchdog();
      const ply = countPlies();
      const turn = detectTurn();
      const state = readBoard(adapter, turn, ply);
      if (!state) {
        if (aPhase === 'playing') {
          if (Date.now() > playUntil) {
            if (retryPlayback(playSig)) schedule(120);
            else schedule(180);
          } else {
            ui.setStatus('Waiting for the move to register\u2026');
            schedule(120);
          }
          return;
        }
        if (aPhase === 'armed') {
          if (Date.now() > autoDue + 8000) {
            cancelAuto();
            lastSig = '';
            ui.setStatus('Auto-play stopped: board unavailable.', true);
            schedule(180);
          } else {
            ui.setStatus('Waiting for the board\u2026');
            schedule(120);
          }
          return;
        }
        ui.setStatus('No live board detected.');
        ui.setLive(false);
        overlay.clear();
        lastSig = '';
        cancelAuto();
        return;
      }
      if (state.root !== boardEl) {
        boardEl = state.root;
        myColor = null; tc = 'unknown'; tcMax = 0; lastSig = ''; moveNum = 0; playTries = 0;
        cancelAuto();
        ui.clearLog();
      }

      if (aPhase === 'playing') {
        if (state.placement !== playPosition) {
          lastSig = state.signature;
          playTries = 0;
          aPhase = 'idle';
          ui.setArmed(false);
          ui.setHot(false);
          ui.setStatus('Played ' + (queued ? queued.res.san : 'move') + '.');
          queued = null;
          ui.showPlayNow(false);
          schedule(40);
          return;
        }
        if (Date.now() > playUntil) {
          if (retryPlayback(state.signature)) schedule(120);
          else schedule(180);
        }
        return;
      }

      if (aPhase === 'armed') {
        if (state.signature !== armedSig) {
          cancelAuto();
          lastSig = '';
        } else if (Date.now() >= autoDue) {
          dispatchAuto(state);
          return;
        } else {
          const left = Math.max(1, Math.round((autoDue - Date.now()) / 1000));
          ui.setStatus('Auto ' + (queued ? queued.res.san : '') + ' in ' + left + 's');
        }
      }

      ui.setLive(true);
      updateTc();

      const mine = resolveColor(state);
      ui.setTurn(state.side, mine);
      const mineNow = mine ? state.side === mine : false;

      if (state.signature === lastSig) return;
      lastSig = state.signature;
      playTries = 0;

      if (!settings.bothSides && mine && !mineNow) {
        ui.setStatus('His move\u2026');
        ui.clearResult();
        overlay.clear();
        oppFen = state.fen;
        oppScore = null;
        return;
      }
      run(false, mineNow);
    } catch (e) {
      ui.setStatus('Retrying\u2026', true);
    } finally {
      ticking = false;
    }
  }

  function run(force, mineNow) {
    if (busy) return;
    const ply = countPlies();
    const turn = detectTurn();
    const state = readBoard(adapter, turn, ply);
    if (!state) { ui.setStatus('No live board detected.', true); return; }
    const mine = resolveColor(state);
    const isMine = mine ? state.side === mine : true;
    if (!force && !settings.bothSides && mine && !isMine) return;
    cancelAuto();
    busy = true;
    ui.setStatus(settings.deep ? 'Deep scan\u2026' : isMine ? 'Thinking\u2026' : 'Reading his move\u2026');
    pending = { state: state, mineNow: isMine, at: Date.now() };
    const boost = settings.autoPower && isMine && settings.autoMode !== 'off';
    think(state, settings.rating, settings.sac ? 1 : 0, settings.depth, tc, settings.deep, clockLeft(), boost, settings.punish);
  }

  function verdictFor(loss, res, mine) {
    let key = 'good';
    if (loss >= 500) key = 'huge';
    else if (loss >= 250) key = 'bad';
    else if (loss >= 120) key = 'mistake';
    else if (loss >= 60) key = 'inacc';
    else if (loss >= 25) key = 'meh';
    const pool = VERDICTS[key];
    let text = pool[Math.floor(Math.random() * pool.length)];
    const mySign = mine === 'w' ? 1 : -1;
    if (res.mateIn && Math.sign(res.mateIn) === mySign) {
      const n = Math.abs(res.mateIn);
      text += n === 1 ? ' You can checkmate him now.' : ' Mate in ' + n + '.';
    }
    const kind = loss >= 500 ? 'win' : loss >= 250 ? 'bad' : loss >= 60 ? 'mild' : 'ok';
    return { text: text, kind: kind, punish: loss >= 120 };
  }

  function pickAutoDelay(opening) {
    return Math.round((opening ? 700 : 900) + Math.random() * 400);
  }

  function shouldAuto(res, good, rating, isMine, mySign) {
    if (settings.autoMode === 'off' || !isMine) return false;
    if (res.opening || res.book) return true;
    if (settings.autoMode === 'all') return true;
    if (res.forced) return true;
    if (res.mateIn * mySign > 0) return true;
    if (good >= 150) return true;
    if (res.sacrifice && good >= 40) return true;
    if ((rating === 'brilliant' || rating === 'great') && res.loss <= 12) return true;
    return false;
  }

  function dispatch(el, type, x, y) {
    const down = type === 'pointerdown' || type === 'mousedown';
    const held = down || type === 'pointermove' || type === 'mousemove';
    const Ctor = type.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ctor(type, {
      bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y, button: 0, buttons: held ? 1 : 0,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, which: 1
    }));
  }

  function elAt(rect, flipped, file, rank, root) {
    const p = squareCenter(rect, flipped, file, rank);
    const hit = document.elementFromPoint(p.x, p.y);
    if (hit && root.contains(hit)) return { el: hit, x: p.x, y: p.y };
    const size = rect.width / 8;
    for (const el of Array.from(root.querySelectorAll('.piece, piece'))) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.left + r.width / 2 - p.x) < size / 2 && Math.abs(r.top + r.height / 2 - p.y) < size / 2) {
        return { el: el, x: p.x, y: p.y };
      }
    }
    return { el: root, x: p.x, y: p.y };
  }

  function pickPromo(p) {
    const letter = PROMO_LETTER[p] || 'q';
    const word = PROMO_WORD[p] || 'queen';
    const sels = ['.promotion-piece.' + letter, '[class*="promotion"] .' + letter,
                  '[class*="promotion"] [class*="' + word + '"]', '.promotion-window .' + letter];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) { el.click(); return; }
    }
  }

  function dispatchAuto(state) {
    if (!queued) { cancelAuto(); return; }
    const res = queued.res;
    const live = readBoard(adapter, state.side, state.ply);
    if (!live || live.signature !== state.signature || live.side !== queued.state.side ||
        live.placement !== queued.state.placement) {
      cancelAuto(); lastSig = ''; schedule(60); return;
    }

    aPhase = 'playing';
    playSig = live.signature;
    playPosition = live.placement;
    playUntil = Date.now() + 3000;
    ui.setStatus('Playing ' + res.san + '\u2026');

    const a = elAt(live.rect, live.flipped, res.from & 7, res.from >> 4, live.root);
    const b = elAt(live.rect, live.flipped, res.to & 7, res.to >> 4, live.root);
    if (!a || !b) { aPhase = 'idle'; return; }

    const lichess = location.hostname.indexOf('lichess.org') >= 0;
    const pointer = lichess ? playTries % 2 === 0 : playTries % 2 === 1;
    const down = pointer ? 'pointerdown' : 'mousedown';
    const move = pointer ? 'pointermove' : 'mousemove';
    const up = pointer ? 'pointerup' : 'mouseup';
    dispatch(a.el, down, a.x, a.y);
    setTimeout(() => {
      dispatch(b.el, move, b.x, b.y);
      dispatch(b.el, up, b.x, b.y);
      if (res.promo) setTimeout(() => pickPromo(res.promo), 140);
    }, 60);
  }

  function stockfishResult(analysis, state) {
    if (!localEngine) localEngine = ENGINE_FACTORY();
    const side = state.side;
    const infos = (analysis.lines || []).filter(info => info && info.pv && info.pv.length);
    const bestInfo = infos[0] || { scoreType: 'cp', score: 0, pv: [] };
    const status = localEngine.positionStatus(state.fen);
    if (!analysis.bestmove || analysis.bestmove === '0000' || analysis.bestmove === '(none)') {
      return { empty: true, san: status.check ? 'checkmate' : 'stalemate' };
    }

    let uci = analysis.bestmove, opening = false, book = false;
    const line = activeLine();
    if (line && typeof line[state.ply] === 'string' &&
        localEngine.formatUci(state.fen, line[state.ply])) {
      uci = line[state.ply];
      opening = true;
    } else if (state.ply >= 0 && state.ply < 6 && Math.random() < (settings.autoPower ? 0.92 : 0.85)) {
      const bookUci = localEngine.openingUci(state.fen, state.ply);
      if (bookUci && localEngine.formatUci(state.fen, bookUci)) {
        uci = bookUci;
        book = true;
      }
    }

    const scoreForSide = info => info.scoreType === 'mate'
      ? Math.sign(info.score) * (29000 - Math.min(28000, Math.abs(info.score) * 2))
      : info.score;
    const candidates = infos.map(info => ({
      info: info, score: scoreForSide(info), move: localEngine.formatUci(state.fen, info.pv[0])
    })).filter(candidate => candidate.move);
    let move = localEngine.formatUci(state.fen, uci);
    if (!move) throw new Error('Stockfish returned an illegal move: ' + uci);
    let chosenInfo = infos.find(info => info.pv[0] === uci) ||
      infos.find(info => info.pv[0] === analysis.bestmove) || bestInfo;
    if (settings.sac && !opening && !book && move.sacrifice) {
      const topScore = candidates.length ? candidates[0].score : scoreForSide(bestInfo);
      const actual = candidates.find(candidate => candidate.info.pv[0] === uci);
      const acceptable = actual && topScore >= 120 && actual.score >= 120 && actual.score >= topScore - 20;
      if (!acceptable) {
        const safer = candidates.find(candidate => !candidate.move.sacrifice &&
          topScore >= 120 && candidate.score >= 120 && candidate.score >= topScore - 20) ||
          candidates.find(candidate => !candidate.move.sacrifice);
        if (safer) {
          uci = safer.info.pv[0];
          move = safer.move;
          chosenInfo = safer.info;
          book = false;
        }
      }
    }
    const chosenScore = scoreForSide(chosenInfo);
    const bestScore = scoreForSide(bestInfo);
    const secondScore = infos.length > 1 ? scoreForSide(infos[1]) : -Infinity;
    const whiteScore = score => side === 'w' ? score : -score;
    const mateForWhite = info => info.scoreType === 'mate' ? info.score * (side === 'w' ? 1 : -1) : 0;
    const lines = [];
    for (const candidate of candidates) {
      lines.push({ san: candidate.move.san, cp: whiteScore(candidate.score), d: candidate.move.detail });
    }
    const pv = localEngine.formatPv(state.fen, chosenInfo.pv);
    const gap = infos.length > 1 ? Math.max(0, bestScore - secondScore) : 9999;
    const forced = (bestInfo.scoreType === 'mate' && bestInfo.score > 0) ||
      bestScore >= 420 || (gap >= 160 && bestScore >= 100);

    return {
      uci: move.uci, san: move.san, from: move.from, to: move.to, promo: move.promo,
      scoreCp: whiteScore(chosenScore), mateIn: mateForWhite(chosenInfo),
      bestMateIn: mateForWhite(bestInfo), loss: book || opening ? 0 : Math.max(0, bestScore - chosenScore),
      gap: gap, only: move.only, book: book, depth: analysis.depth || chosenInfo.depth || 0,
      opening: opening, forced: forced, detail: move.detail, sacrifice: move.sacrifice,
      lines: lines, pv: pv
    };
  }

  function onWorker(e) {
    const data = (e && e.data) || {};
    if (data.type === 'pulse') { if (settings.auto) tick(); return; }
    const engineFailure = !data.ok && /worker failed|WebAssembly failed|engine did not initialize/i.test(data.error || '');
    if (engineFailure) stopEngine();

    const p = pending;
    busy = false;
    if (!p) {
      if (engineFailure && ui) ui.setStatus('Stockfish error: ' + data.error, true);
      return;
    }

    if (!data.ok) {
      if (!retryFlip && /Illegal/.test(data.error || '')) {
        retryFlip = true;
        const st = p.state;
        const flipped = st.side === 'w' ? 'b' : 'w';
        st.fen = st.fen.replace(/ (w|b) /, ' ' + flipped + ' ');
        st.side = flipped;
        busy = true; pending = p;
        think(st, settings.rating, settings.sac ? 1 : 0, settings.depth, tc, settings.deep, clockLeft(), false, false);
        return;
      }
      retryFlip = false;
      ui.setStatus(data.error ? 'Stockfish error: ' + data.error : 'Position unreadable, retrying\u2026', true);
      lastSig = '';
      return;
    }
    retryFlip = false;

    const state = p.state;
    let res;
    try { res = data.res || stockfishResult(data.analysis, state); }
    catch (err) {
      ui.setStatus('Stockfish error: ' + String(err && err.message || err), true);
      lastSig = '';
      return;
    }
    if (res.empty) {
      const over = res.san === 'draw' ? 'Draw by material.' : 'Game over (' + res.san + ').';
      ui.setStatus(over);
      overlay.clear();
      cancelAuto();
      return;
    }

    const mine = resolveColor(state);
    const isMine = mine ? state.side === mine : p.mineNow;

    let loss = null;
    if (isMine && oppFen && oppScore != null && oppFen !== state.fen) {
      const oppColor = mine === 'w' ? 'b' : 'w';
      loss = Math.max(0, Math.round((oppScore - res.scoreCp) * (oppColor === 'w' ? 1 : -1)));
    }

    const rating = rate(res, loss == null ? 0 : loss, isMine, mine || state.side);
    const mySign = (mine || state.side) === 'w' ? 1 : -1;
    const good = res.scoreCp * mySign * (isMine ? 1 : -1);
    const mateFor = res.mateIn * mySign;

    const tcBase = tc === 'bullet' ? 55 : tc === 'blitz' ? 80 : tc === 'rapid' ? 130 : tc === 'classical' ? 190 : 110;
    const target = Math.min(430, (tcBase + Math.max(0, 150 - settings.rating * 0.05)) * (0.85 + Math.random() * 0.4));
    const delay = Math.max(0, target - (Date.now() - p.at));

    setTimeout(() => {
      const live = readBoard(adapter, state.side, state.ply);
      if (!live || live.signature !== state.signature) return;

      const v = loss != null ? verdictFor(loss, res, mine) : null;
      const kind = res.opening ? 'theory'
        : res.sacrifice ? 'sac'
        : (v && v.punish) || res.forced ? 'punish'
        : isMine ? 'mine' : 'his';
      overlay.draw(
        { file: res.from & 7, rank: res.from >> 4 },
        { file: res.to & 7, rank: res.to >> 4 },
        live.rect, live.flipped, res.san, kind, settings.ratings ? rating : null
      );
      ui.showResult(res, isMine, rating, res.forced);
      ui.showReason(reasonFor(res, settings.coachRating), res);
      ui.setHot(!!res.forced && isMine);

      const op = OPENING_BY_ID[settings.opening];
      ui.setTheory(res.opening && op ? op.name : null);

      if (isMine && mateFor > 0) {
        const n = Math.abs(res.mateIn);
        ui.showMate(n === 1 ? 'Checkmate available now.' : 'Forced mate in ' + n + '.');
      } else if (!isMine && mateFor < 0) {
        ui.showMate('He has mate in ' + Math.abs(res.mateIn) + ' if you allow it.');
      } else ui.showMate(null);

      if (v) ui.showVerdict(v.text, v.kind);

      const num = state.ply >= 0 ? Math.floor(state.ply / 2) + 1 : ++moveNum;
      ui.addLog(res.san, rating, isMine, num);

      if (shouldAuto(res, good, rating, isMine, mySign)) {
        queued = { res: res, state: state };
        aPhase = 'armed';
        armedSig = state.signature;
        autoDue = Date.now() + pickAutoDelay(res.opening);
        ui.showPlayNow(true);
        ui.setArmed(true);
        ui.setStatus('Auto ' + res.san + ' in ' + Math.max(1, Math.round((autoDue - Date.now()) / 1000)) + 's');
      } else {
        ui.setStatus(isMine
          ? (res.opening ? 'Theory: ' + res.san + '.'
            : res.forced ? 'Take it: ' + res.san + '.'
            : 'Play ' + res.san + ' (' + RATINGS[rating].label + ').')
          : 'His move \u2014 best reply is ' + res.san + '.');
      }

      if (!isMine) { oppFen = state.fen; oppScore = res.scoreCp; }
      else { oppFen = null; oppScore = null; }
    }, delay);
  }

  try {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg && msg.type === 'vcc-pulse' && settings.auto) {
        if (!pulseOn) pulse(true);
        tick();
      }
    });
  } catch (e) {}

  let bgPort = null, bgRetry = 0;
  function linkBackground() {
    try {
      bgPort = chrome.runtime.connect({ name: 'vcc-pulse' });
      bgRetry = 0;
      bgPort.onMessage.addListener(m => {
        if (m && m.type === 'vcc-pulse' && settings.auto) {
          if (!pulseOn) pulse(true);
          tick();
        }
      });
      bgPort.onDisconnect.addListener(() => {
        bgPort = null;
        bgRetry = Math.min(bgRetry + 1, 6);
        setTimeout(linkBackground, 400 * bgRetry);
      });
    } catch (e) { bgPort = null; }
  }

  document.addEventListener('pointerdown', keepAwakeGesture, { passive: true, capture: true });
  document.addEventListener('keydown', keepAwakeGesture, { passive: true, capture: true });

  document.addEventListener('visibilitychange', () => {
    if (settings.autoMode === 'off') return;
    if (document.visibilityState === 'visible') { awake(settings.keepAwake); pulse(true); lastSig = ''; schedule(50); }
  });

  document.addEventListener('keydown', e => {
    if (!e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); cancelAuto(); run(true, true); }
    if (k === 's') { e.preventDefault(); cancelAuto(); ui.setStatus('Auto stopped.'); }
    if (k === 'h') {
      e.preventDefault();
      hidden = !hidden;
      const host = document.getElementById('vcc-host');
      if (host) host.style.display = hidden ? 'none' : '';
      if (!hidden && !host) boot();
    }
  });

  window.addEventListener('resize', () => { if (settings.auto) { lastSig = ''; schedule(150); } });
  window.addEventListener('scroll', () => { lastSig = ''; schedule(90); }, { passive: true, capture: true });

  try {
    chrome.storage.local.get(['vccSettings'], data => {
      if (data && data.vccSettings) {
        Object.assign(settings, data.vccSettings);
        if (data.vccSettings.autoPlay !== undefined && !data.vccSettings.autoMode) {
          settings.autoMode = data.vccSettings.autoPlay ? 'strong' : 'off';
        }
        if (!OPENING_BY_ID[settings.opening]) settings.opening = 'none';
      }
      const saved = settings.perHost[hostKey()];
      if (saved) settings.rating = saved;
      boot();
    });
  } catch (e) {
    boot();
  }
})();