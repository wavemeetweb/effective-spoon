window.onerror = function(msg, url, line) {
  if (msg.includes('window is not defined') || msg.includes('WebGPU') || url.includes('worker')) {
    console.warn("Optional AI feature failed. Ignoring.", msg);
    return true; 
  }
  var el = document.getElementById('error-overlay');
  if (el) { el.style.display = 'block'; el.textContent = 'Error: ' + msg + '\nAt: ' + url + ':' + line; }
  return false;
};

document.addEventListener('DOMContentLoaded', function() {
  try {
    'use strict';

    const SUPABASE_URL = 'https://wpihvtfezqlmcdihlyql.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_zuIhFz9-r7Bpaa9o3IXyxw_hxgjTd3s';
    var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    var $ = function (s) { return document.querySelector(s); };
    var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
    
    var toastTimer;
    function toast(msg) {
      var t = $('#toast'); if (!t) return;
      t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
    }

    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    var ALPHA = 'abcdefghijkmnpqrstuvwxyz23456789';
    function newCode() { var s = ''; for (var i = 0; i < 9; i++) s += ALPHA[(Math.random() * ALPHA.length) | 0]; return s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6, 9); }
    function norm(code) { return String(code || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function fmtTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    function show(id) { $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); }); }

    /* =========================================================
       Cloud AI Engine (Gemini API Only)
       ========================================================= */
    let isAiLoading = false;

    // ⚠️ PASTE YOUR FREE GEMINI API KEY HERE ⚠️
    const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE'; 

    /* =========================================================
       Guest URL Logic
       ========================================================= */
    var pendingMeetingCode = '';
    
    function checkMeetingLink() {
      const hash = location.hash;
      if (hash.includes('m=')) {
        pendingMeetingCode = hash.split('m=')[1];
        $('#guestMeetCodeDisplay').textContent = pendingMeetingCode.toUpperCase();
        return true;
      }
      return false;
    }

    var hasPendingLink = checkMeetingLink();

    $('#guestJoinBtn').addEventListener('click', function() {
      let guestName = $('#guestNameInput').value.trim();
      if (!guestName) { toast("Please enter your name"); return; }
      ME.id = 'guest-' + uid();
      ME.name = guestName;
      ME.username = guestName.replace(/\s/g, '').toLowerCase() + '_guest';
      
      show('scr-meet');
      Meet.join(pendingMeetingCode, 'Guest Meeting');
    });

    $('#guestGoToLogin').addEventListener('click', function(e) {
      e.preventDefault();
      show('scr-login');
    });

    /* =========================================================
       Auth Logic
       ========================================================= */
    var ME = { id: '', username: '', name: '' };
    var isSignUp = false;

    $('#authToggleBtn').addEventListener('click', function(e) {
      e.preventDefault();
      isSignUp = !isSignUp;
      $('#authTitle').textContent = isSignUp ? '[ INITIALIZE_SIGNUP ]' : '[ INITIALIZE_LOGIN ]';
      $('#authBtn').querySelector('.btn-text').textContent = isSignUp ? 'GENERATE ID' : 'INITIALIZE';
      $('#usernameField').style.display = isSignUp ? 'flex' : 'none';
      $('#authToggleText').textContent = isSignUp ? 'EXISTING IDENTITY?' : "NO CLEARANCE?";
      $('#authToggleBtn').textContent = isSignUp ? 'ACCESS_LOGIN' : 'REQUEST ACCESS';
      $('#authError').style.display = 'none';
    });

    async function handleEmailAuth() {
      var email = $('#authEmail').value.trim(), pass = $('#authPass').value, username = $('#authUsername').value.trim().toLowerCase(), err = $('#authError');
      if (!email || !pass) { err.textContent = 'Email and password required.'; err.style.display = 'block'; return; }
      if (isSignUp && !username) { err.textContent = 'Username required.'; err.style.display = 'block'; return; }
      
      err.textContent = 'Authenticating...'; err.style.display = 'block'; err.style.color = 'var(--muted)'; $('#authBtn').disabled = true;

      if (supabase) {
        if (isSignUp) {
          const { error } = await supabase.auth.signUp({ email: email, password: pass, options: { data: { username: username } } });
          if (error) { err.textContent = error.message; err.style.color = 'var(--danger)'; $('#authBtn').disabled = false; }
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: email, password: pass });
          if (error) { err.textContent = error.message; err.style.color = 'var(--danger)'; $('#authBtn').disabled = false; }
        }
      }
    }

    $('#authBtn').addEventListener('click', handleEmailAuth);
    $('#authPass').addEventListener('keydown', function(e) { if (e.key === 'Enter') handleEmailAuth(); });
    $('#googleLoginBtn').addEventListener('click', async function() {
      var err = $('#authError'); err.textContent = 'Redirecting...'; err.style.display = 'block'; err.style.color = 'var(--muted)'; $('#googleLoginBtn').disabled = true;
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://ai-meetly.vercel.app', scopes: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile' } });
      if (error) { err.textContent = error.message; err.style.color = 'var(--danger)'; $('#googleLoginBtn').disabled = false; }
    });

    show('scr-login');
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => { 
        if (session) handleUserLogin(session.user); 
        else { if (hasPendingLink) show('scr-guest-join'); else show('scr-login'); }
      });

      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) handleUserLogin(session.user);
        else if (event === 'SIGNED_OUT') show('scr-login');
      });
    }

    async function handleUserLogin(user) {
      try {
        const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
        if (profile) { initUser(user.id, profile.username); }
        else {
          var defaultUsername = user.user_metadata?.full_name?.toLowerCase().replace(/\s/g, '') || user.email.split('@')[0].toLowerCase();
          await supabase.from('profiles').insert({ id: user.id, username: defaultUsername });
          initUser(user.id, defaultUsername);
        }
      } catch (err) { initUser(user.id, user.email.split('@')[0]); }
    }

    function initUser(userId, username) {
      ME.id = userId; ME.username = username; ME.name = username.charAt(0).toUpperCase() + username.slice(1);
      $('#heroName').textContent = ME.name; $('#userPill').textContent = ME.name;
      
      show('scr-home'); 
      try { 
        initMainPeer(); 
        if (typeof renderFriends === 'function') renderFriends(); 
      } catch (e) { console.error("Init failed:", e); }

      if (hasPendingLink) Meet.join(pendingMeetingCode, 'Meeting');
    }

    $('#logoutBtn').addEventListener('click', async function() { if (!confirm('Log out?')) return; if (supabase) await supabase.auth.signOut(); location.reload(); });

    /* =========================================================
       WebRTC & PeerJS
       ========================================================= */
    var AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: { ideal: 48000 }, channelCount: { ideal: 2 }, googEchoCancellation: true, googAutoGainControl: true, googNoiseSuppression: true, googHighpassFilter: true };
    function tuneOpusSdp(sdp) { return sdp ? sdp.replace(/a=fmtp:(\d+) useinbandfec=1/gi, 'a=fmtp:$1 useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=128000;maxplaybackrate=48000;minptime=10') : sdp; }
    function tunePc(pc) { if (!pc || pc.__audioTuned) return; pc.__audioTuned = true; var origOffer = pc.createOffer.bind(pc), origAnswer = pc.createAnswer.bind(pc); pc.createOffer = function (o) { return origOffer(o).then(function (d) { d.sdp = tuneOpusSdp(d.sdp); return d; }); }; pc.createAnswer = function (o) { return origAnswer(o).then(function (d) { d.sdp = tuneOpusSdp(d.sdp); return d; }); }; }
    (function installPcHook() { if (typeof RTCPeerConnection === 'undefined') return; var Orig = RTCPeerConnection; function Wrapped(cfg) { var pc = new Orig(cfg); tunePc(pc); return pc; } Wrapped.prototype = Orig.prototype; try { Object.setPrototypeOf(Wrapped, Orig); } catch (e) {} window.RTCPeerConnection = Wrapped; })();

    var PEER_OPTS = { 
      debug: 0, 
      config: { 
        iceServers: [ 
          { urls: 'stun:stun.l.google.com:19302' }, 
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }, 
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' } 
        ], 
        sdpSemantics: 'unified-plan' 
      } 
    };

    var mainPeer = null;
    function initMainPeer() {
      if (mainPeer) mainPeer.destroy();
      var safeUsername = ME.username.replace(/[^a-zA-Z0-9]/g, ''); 
      mainPeer = new Peer('mc-user-' + safeUsername, PEER_OPTS);
      
      // Handle PeerJS WebSocket errors gracefully
      mainPeer.on('error', function(err) {
        console.error("PeerJS Error:", err);
        if (err.type === 'network' || err.type === 'server-error') {
          toast("Signaling server is busy. Please try again in a moment.");
        }
      });

      mainPeer.on('call', function(incoming) { if (confirm('Incoming call from ' + incoming.peer.replace('mc-user-', '') + '. Accept?')) { Meet.acceptDirectCall(incoming); } else { incoming.close(); } });
    }

    function renderFriends() { $('#friendList').innerHTML = '<div class="empty">Add friends via the search bar above.</div>'; }
    $('#addFriendBtn').addEventListener('click', function() { toast("Friend system requires a full database setup."); });

    /* =========================================================
       Meeting Logic
       ========================================================= */
    var Meet = {
      peer: null, conn: null, call: null, stream: null, code: '', title: '', ended: false,
      isScreenSharing: false, videoTrack: null, screenTrack: null,
      transcript: '', recognition: null, isDrawing: false,
      isHost: false, isMicLocked: false, isCamLocked: false, 
      participants: [],

      join: async function (code, title) {
        this._cleanup(); this.ended = false; this.code = code; this.title = title || 'Meeting';
        
        $('#meetTitle').textContent = this.title; $('#meetCode').textContent = code;
        $('#meetMsgs').innerHTML = ''; $('#meetChatDrawer').classList.remove('open'); $('#aiDrawer').classList.remove('open'); $('#participantsDrawer').classList.remove('open');
        $('#remoteVideo').srcObject = null; $('#stage').classList.remove('whiteboard-active');
        
        this.setStatus('Starting camera…'); this.overlay('Starting camera…'); show('scr-meet');
        await this._getMedia();
        this.setStatus('Waiting…'); this.overlay('Waiting for someone to join…'); 
        
        this.peer = new Peer('mc-mtg-' + norm(code), PEER_OPTS);
        
        // Handle PeerJS errors during meeting join
        this.peer.on('error', function (err) {
           if (err.type === 'unavailable-id') {
             try { this.peer.destroy(); } catch (e) {} this.peer = null; 
             Meet.connectGuest('mc-mtg-' + norm(code));
           } else if (err.type === 'network' || err.type === 'server-error') {
             Meet.setStatus('Network Error');
             Meet.overlay('Could not connect to signaling server. Please refresh.');
           }
        }.bind(this));

        this.peer.on('open', function () { 
          this.isHost = true; 
          this.setStatus('Hosting (Teacher)'); 
          $('#hostMuteAll').style.display = 'flex';
          $('#hostCamAll').style.display = 'flex';
          this.addParticipant(ME.name, 'Teacher');
        }.bind(this));
        
        this.peer.on('connection', function (c) { Meet.acceptConn(c); });
        this.peer.on('call', function (incoming) {
          if (Meet.call) { try { incoming.close(); } catch (e) {} return; }
          Meet.call = incoming; try { incoming.answer(Meet.stream); } catch (e) {}
          Meet.pipeCall(incoming);
        });
        
        this.setupWhiteboard();
      },

      connectGuest: function (targetId) {
        this.peer = new Peer(PEER_OPTS);
        
        this.peer.on('error', function(err) {
          if (err.type === 'peer-unavailable') { 
            Meet.setStatus('Not found'); Meet.overlay('Meeting not found.'); 
          } else if (err.type === 'network' || err.type === 'server-error') {
            Meet.setStatus('Network Error'); Meet.overlay('Signaling server unreachable.');
          }
        });

        this.peer.on('open', function () {
          Meet.setStatus('Connecting (Student)…');
          $('#raiseHand').style.display = 'flex'; 
          Meet.addParticipant(ME.name, 'Student'); 
          
          var c = Meet.peer.connect(targetId, { reliable: true, metadata: { name: ME.name } }); 
          if (c) Meet.acceptConn(c);
          try { var media = Meet.peer.call(targetId, Meet.stream); if (media) { Meet.call = media; Meet.pipeCall(media); } } catch (e) {}
        });
      },

      addParticipant: function(name, role) {
        if (!this.participants.some(p => p.name === name)) {
          this.participants.push({ name: name, role: role, id: uid() });
          this.renderParticipants();
        }
      },

      removeParticipant: function(name) {
        this.participants = this.participants.filter(p => p.name !== name);
        this.renderParticipants();
      },

      renderParticipants: function() {
        const list = $('#participantsList');
        $('#participantCount').textContent = this.participants.length;
        list.innerHTML = '';
        this.participants.forEach(p => {
          list.innerHTML += `<div class="part-item"><div><div class="part-name">${p.name}</div><div class="part-role">${p.role}</div></div><div style="font-size:16px;">${p.role === 'Teacher' ? '👑' : '🎓'}</div></div>`;
        });
      },

      downloadParticipantList: function() {
        let csvContent = "data:text/csv;charset=utf-8,Name,Role\n";
        this.participants.forEach(p => { csvContent += `${p.name},${p.role}\n`; });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `participants_${this.code}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      },

      acceptConn: function (c) {
        var self = this;
        if (this.conn && this.conn.open) { c.on('open', function () { c.send({ type: 'busy' }); c.close(); }); return; }
        this.conn = c;
        
        c.on('open', function () { 
          self.setStatus('Connected'); self.hideOverlay(); 
          if (self.isHost && c.metadata && c.metadata.name) { self.addParticipant(c.metadata.name, 'Student'); }
          if (!self.isHost) { self.addParticipant("Teacher", "Teacher"); }
        });
        
        c.on('data', function (d) {
          if (!d || typeof d !== 'object') return;
          if (d.type === 'chat') appendBubble($('#meetMsgs'), { id: uid(), sender_id: d.sender_id, content: d.text, image_url: d.img, created_at: new Date() }, ME.username);
          if (d.type === 'whiteboard') { Meet.drawLocal($('#whiteboardCanvas').getContext('2d'), d.x0, d.y0, d.x1, d.y1); }
          
          if (d.type === 'command') {
            if (d.action === 'force-mute') { self.isMicLocked = true; if (self.stream) { self.stream.getAudioTracks()[0].enabled = false; } $('#toggleMic').classList.add('off'); $('#toggleMic').querySelector('small').textContent = 'Locked'; toast("Teacher muted your microphone."); }
            if (d.action === 'force-cam-off') { self.isCamLocked = true; if (self.stream) { self.stream.getVideoTracks()[0].enabled = false; } $('#toggleCam').classList.add('off'); $('#toggleCam').querySelector('small').textContent = 'Locked'; toast("Teacher disabled your camera."); }
            if (d.action === 'allow-mic') { self.isMicLocked = false; $('#toggleMic').querySelector('small').textContent = 'Mute'; toast("Teacher approved your request."); }
            if (d.action === 'allow-cam') { self.isCamLocked = false; $('#toggleCam').querySelector('small').textContent = 'Camera'; toast("Teacher approved your request."); }
          }

          if (d.type === 'request-speak') {
             if (confirm("Student is requesting to turn on their mic/cam. Approve?")) {
               self.conn.send({ type: 'command', action: 'allow-mic' });
               self.conn.send({ type: 'command', action: 'allow-cam' });
             }
          }
        });

        c.on('close', function () { 
          self.conn = null; self.setStatus('Disconnected'); $('#remoteVideo').srcObject = null; self.overlay('Participant left.'); 
          if (self.isHost && c.metadata && c.metadata.name) self.removeParticipant(c.metadata.name);
        });
      },

      forceMuteAll: function() { if (this.conn && this.conn.open) { this.conn.send({ type: 'command', action: 'force-mute' }); toast("All students muted."); } },
      forceCamAll: function() { if (this.conn && this.conn.open) { this.conn.send({ type: 'command', action: 'force-cam-off' }); toast("All student cameras disabled."); } },
      requestToSpeak: function() { if (this.conn && this.conn.open) { this.conn.send({ type: 'request-speak' }); toast("Request sent to Teacher."); } },

      toggleMic: function () { if (this.isMicLocked) { toast("Teacher has muted you."); return; } if (!this.stream) return; var t = this.stream.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; $('#toggleMic').classList.toggle('off', !t.enabled); } },
      toggleCam: function () { if (this.isCamLocked) { toast("Teacher has disabled your camera."); return; } if (!this.stream) return; var t = this.stream.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; $('#toggleCam').classList.toggle('off', !t.enabled); } },

      _getMedia: async function() {
        try { this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: AUDIO_CONSTRAINTS }); } 
        catch (e1) { try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS }); toast('Audio only'); } catch (e2) { this.stream = new MediaStream(); toast('No mic/cam access'); } }
        $('#localVideo').srcObject = this.stream; 
        $('#localVideo').play().catch(e=>console.log("Play error:", e));
        this.videoTrack = this.stream.getVideoTracks()[0];
      },

      toggleScreenShare: async function() {
        if (!this.call) return;
        if (this.isScreenSharing) {
          if (this.screenTrack) this.screenTrack.stop();
          const sender = this.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender && this.videoTrack) sender.replaceTrack(this.videoTrack);
          $('#toggleScreen').classList.remove('active'); this.isScreenSharing = false;
        } else {
          try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            this.screenTrack = screenStream.getVideoTracks()[0];
            const sender = this.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(this.screenTrack);
            this.isScreenSharing = true; $('#toggleScreen').classList.add('active');
            this.screenTrack.onended = () => { this.toggleScreenShare(); };
          } catch (err) { console.error("Screen share failed", err); }
        }
      },

      setupWhiteboard: function() {
        const canvas = $('#whiteboardCanvas'); if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
        ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#5bc0be';
        let drawing = false, lastX = 0, lastY = 0;

        canvas.addEventListener('mousedown', (e) => { drawing = true; [lastX, lastY] = [e.offsetX, e.offsetY]; });
        canvas.addEventListener('mousemove', (e) => {
          if (!drawing) return;
          this.drawLocal(ctx, lastX, lastY, e.offsetX, e.offsetY);
          if (this.conn && this.conn.open) this.conn.send({ type: 'whiteboard', x0: lastX, y0: lastY, x1: e.offsetX, y1: e.offsetY });
          [lastX, lastY] = [e.offsetX, e.offsetY];
        });
        canvas.addEventListener('mouseup', () => drawing = false);
        canvas.addEventListener('mouseout', () => drawing = false);
      },

      drawLocal: function(ctx, x0, y0, x1, y1) { if(!ctx) return; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.closePath(); },

      toggleCaptions: function() {
        if (this.recognition) { this.recognition.stop(); this.recognition = null; $('#captionsBox').style.display = 'none'; $('#toggleCaptions').classList.remove('active'); return; }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { toast("Captions not supported."); return; }
        this.recognition = new SpeechRecognition(); this.recognition.continuous = true; this.recognition.interimResults = true;
        this.recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; ++i) { if (event.results[i].isFinal) this.transcript += event.results[i][0].transcript + ' '; }
          $('#captionsBox').textContent = this.transcript.slice(-60); $('#captionsBox').style.display = 'block';
        };
        this.recognition.start(); $('#toggleCaptions').classList.add('active');
      },

      generateSummary: async function() {
        const aiBox = $('#aiMsgs');
        if (this.transcript.trim() === '') { aiBox.innerHTML += `<div class="bubble ai"><div class="meta">Meetly AI</div>No speech detected yet. Please turn on captions and speak!</div>`; aiBox.scrollTop = aiBox.scrollHeight; return; }
        if (isAiLoading) return; isAiLoading = true;
        
        const loadingId = 'ai-loading-' + Date.now();
        aiBox.innerHTML += `<div class="bubble ai" id="${loadingId}"><div class="meta">Meetly AI</div>Analyzing transcript...</div>`; 
        aiBox.scrollTop = aiBox.scrollHeight;

        try {
          console.log("Using Cloud API (Gemini) for AI.");
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              contents: [{ parts: [{ text: `You are a helpful meeting assistant. Summarize the following transcript into concise bullet points and a list of action items.\n\nTranscript:\n${this.transcript}` }] }] 
            })
          });
          
          if (!response.ok) throw new Error('Cloud API request failed. Check API key.');
          
          const data = await response.json();
          const summaryText = data.candidates[0].content.parts[0].text;
          
          document.getElementById(loadingId).innerHTML = `<div class="meta">Meetly AI</div>${summaryText.replace(/\n/g, '<br>')}`;
        } catch (err) {
          console.error("AI Error:", err);
          document.getElementById(loadingId).innerHTML = `<div class="meta">Meetly AI</div>⚠️ Error: ${err.message}`;
        } finally {
          isAiLoading = false;
        }
        aiBox.scrollTop = aiBox.scrollHeight;
      },

      setStatus: function (t) { $('#meetStatus').textContent = t; },
      overlay: function (t) { var o = $('#stageOverlay'); if (o) { o.textContent = t; o.style.display = 'flex'; } },
      hideOverlay: function () { var o = $('#stageOverlay'); if (o) o.style.display = 'none'; },

      send: function (text, imgData) {
        if (this.conn && this.conn.open) { this.conn.send({ type: 'chat', text: text || '', img: imgData || null, sender_id: ME.id }); }
        appendBubble($('#meetMsgs'), { id: uid(), sender_id: ME.id, content: text, image_url: imgData, created_at: new Date() }, ME.username);
      },

      leave: function () { 
        this.ended = true; if (this.recognition) this.recognition.stop(); this._cleanup(); 
        if (ME.id && ME.id.startsWith('guest-')) { show('scr-login'); toast("Sign up to save your meeting history!"); } else { show('scr-home'); }
      },

      _cleanup: function () {
        if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
        if (this.call) { try { this.call.close(); } catch (e) {} this.call = null; }
        if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
        if (this.stream) { this.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); this.stream = null; }
        if (this.screenTrack) { this.screenTrack.stop(); this.screenTrack = null; }
        if (this.recognition) { this.recognition.stop(); this.recognition = null; }
        this.transcript = ''; this.participants = []; 
        $('#remoteVideo').srcObject = null; $('#localVideo').srcObject = null; $('#captionsBox').style.display = 'none';
      }
    };

    /* =========================================================
       UI Binding
       ========================================================= */
    function appendBubble(container, m, myUsername) {
      if (!container) return;
      var isMe = (m.sender_id === ME.id);
      var wrap = document.createElement('div'); wrap.className = 'bubble ' + (isMe ? 'me' : 'them');
      var meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = (isMe ? 'You' : 'User') + ' · ' + fmtTime(new Date().getTime());
      var body = document.createElement('div'); if (m.content) body.textContent = m.content;
      if (m.image_url) { var img = document.createElement('img'); img.src = m.image_url; body.appendChild(img); }
      wrap.appendChild(meta); wrap.appendChild(body); container.appendChild(wrap); container.scrollTop = container.scrollHeight;
    }

    $('#toggleMic').addEventListener('click', function () { Meet.toggleMic(); });
    $('#toggleCam').addEventListener('click', function () { Meet.toggleCam(); });
    $('#toggleScreen').addEventListener('click', function () { Meet.toggleScreenShare(); });
    $('#toggleCaptions').addEventListener('click', function () { Meet.toggleCaptions(); });
    $('#hostMuteAll').addEventListener('click', function () { Meet.forceMuteAll(); });
    $('#hostCamAll').addEventListener('click', function () { Meet.forceCamAll(); });
    $('#raiseHand').addEventListener('click', function () { Meet.requestToSpeak(); });
    $('#toggleWhiteboard').addEventListener('click', function () { $('#stage').classList.toggle('whiteboard-active'); $('#toggleWhiteboard').classList.toggle('active'); });
    $('#leaveMeet').addEventListener('click', function () { Meet.leave(); });
    
    $('#meetChatBtn').addEventListener('click', function () { $('#meetChatDrawer').classList.toggle('open'); $('#aiDrawer').classList.remove('open'); $('#participantsDrawer').classList.remove('open'); });
    $('#closeDrawer').addEventListener('click', function () { $('#meetChatDrawer').classList.remove('open'); });
    $('#meetAiBtn').addEventListener('click', function () { $('#aiDrawer').classList.toggle('open'); $('#meetChatDrawer').classList.remove('open'); $('#participantsDrawer').classList.remove('open'); });
    $('#closeAiDrawer').addEventListener('click', function () { $('#aiDrawer').classList.remove('open'); });
    $('#meetParticipantsBtn').addEventListener('click', function () { $('#participantsDrawer').classList.toggle('open'); $('#meetChatDrawer').classList.remove('open'); $('#aiDrawer').classList.remove('open'); });
    $('#closeParticipantsDrawer').addEventListener('click', function () { $('#participantsDrawer').classList.remove('open'); });
    $('#downloadListBtn').addEventListener('click', function() { Meet.downloadParticipantList(); });
    $('#aiSummaryBtn').addEventListener('click', function() { Meet.generateSummary(); });

    function sendMeetMsg() { var v = $('#meetInput').value.trim(); if (!v) return; Meet.send(v); $('#meetInput').value = ''; }
    $('#meetSend').addEventListener('click', sendMeetMsg);
    $('#meetInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMeetMsg(); });

    $('#scr-home').addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'new') Meet.join(newCode(), 'Instant meeting');
      else if (act === 'join') { $('#joinCode').value = ''; show('scr-join'); }
      else if (act === 'schedule') { show('scr-schedule'); }
      else if (act === 'groups') { show('scr-groups'); }
      else if (act === 'friends') { show('scr-friends'); }
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-back]'); if (!b) return;
      show(b.getAttribute('data-back') || 'scr-home');
    });
    $('#doJoin').addEventListener('click', function () { var code = $('#joinCode').value.trim(); if (!code) return; Meet.join(code, 'Meeting'); });

    window.addEventListener('beforeunload', function () { Meet._cleanup(); });

  } catch (err) { console.error("Fatal initialization error:", err); }
});
