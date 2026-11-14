window.onerror = function(msg, url, line) {
  var el = document.getElementById('error-overlay');
  if (el) {
    el.style.display = 'block';
    el.textContent = 'Error: ' + msg + '\nAt: ' + url + ':' + line;
  }
  return false;
};

document.addEventListener('DOMContentLoaded', function() {
  try {
    'use strict';

    /* =========================================================
       Supabase Setup
       ========================================================= */
    const SUPABASE_URL = 'https://wpihvtfezqlmcdihlyql.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_zuIhFz9-r7Bpaa9o3IXyxw_hxgjTd3s';
    
    var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    var $ = function (s) { return document.querySelector(s); };
    var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
    
    var LS = {
      get: function (k, d) { try { var v = localStorage.getItem('mc:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { localStorage.setItem('mc:' + k, JSON.stringify(v)); } catch (e) {} },
      del: function(k) { try { localStorage.removeItem('mc:' + k); } catch (e) {} }
    };

    var toastTimer;
    function toast(msg) {
      var t = $('#toast'); if (!t) return;
      t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
    }

    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    var ALPHA = 'abcdefghijkmnpqrstuvwxyz23456789';
    function newCode() {
      var s = '';
      for (var i = 0; i < 9; i++) s += ALPHA[(Math.random() * ALPHA.length) | 0];
      return s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6, 9);
    }
    function norm(code) { return String(code || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function fmtTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    
    function show(id) { $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); }); }

    /* =========================================================
       Auth Logic (Google OAuth & Email/Password)
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
      var email = $('#authEmail').value.trim();
      var pass = $('#authPass').value;
      var username = $('#authUsername').value.trim().toLowerCase();
      var err = $('#authError');
      
      if (!email || !pass) { err.textContent = 'Email and password required.'; err.style.display = 'block'; return; }
      if (isSignUp && !username) { err.textContent = 'Username required.'; err.style.display = 'block'; return; }
      
      err.textContent = 'Authenticating...'; err.style.display = 'block'; err.style.color = 'var(--muted)';
      $('#authBtn').disabled = true;

      if (supabase) {
        if (isSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email: email, password: pass, options: { data: { username: username } }
          });
          if (error) { err.textContent = error.message; err.style.color = 'var(--danger)'; $('#authBtn').disabled = false; return; }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({ email: email, password: pass });
          if (error) { err.textContent = error.message; err.style.color = 'var(--danger)'; $('#authBtn').disabled = false; return; }
        }
      }
    }

    $('#authBtn').addEventListener('click', handleEmailAuth);
    $('#authPass').addEventListener('keydown', function(e) { if (e.key === 'Enter') handleEmailAuth(); });

    $('#googleLoginBtn').addEventListener('click', async function() {
      var err = $('#authError');
      err.textContent = 'Redirecting to Google...'; err.style.display = 'block'; err.style.color = 'var(--muted)';
      $('#googleLoginBtn').disabled = true;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://ai-meetly.vercel.app' }
      });
      
      if (error) { err.textContent = error.message; err.style.color = 'var(--danger)'; $('#googleLoginBtn').disabled = false; }
    });

    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) handleUserLogin(session.user);
      });

      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) handleUserLogin(session.user);
        else if (event === 'SIGNED_OUT') show('scr-login');
      });
    }

    async function handleUserLogin(user) {
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
      
      if (profile) {
        initUser(user.id, profile.username);
      } else {
        var defaultUsername = user.user_metadata?.full_name?.toLowerCase().replace(/\s/g, '') || user.email.split('@')[0].toLowerCase();
        await supabase.from('profiles').insert({ id: user.id, username: defaultUsername });
        initUser(user.id, defaultUsername);
      }
    }

    function initUser(userId, username) {
      ME.id = userId; ME.username = username; ME.name = username.charAt(0).toUpperCase() + username.slice(1);
      $('#heroName').textContent = ME.name; $('#userPill').textContent = ME.name;
      show('scr-home'); initMainPeer(); renderFriends();
    }

    $('#logoutBtn').addEventListener('click', async function() {
      if (!confirm('Log out of Meetly?')) return;
      if (supabase) await supabase.auth.signOut();
      location.reload();
    });

    /* =========================================================
       WebRTC Audio Tuning & TURN Servers
       ========================================================= */
    var AUDIO_CONSTRAINTS = {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 }, channelCount: { ideal: 2 },
      googEchoCancellation: true, googAutoGainControl: true, googNoiseSuppression: true, googHighpassFilter: true, googTypingNoiseDetection: true
    };

    function tuneOpusSdp(sdp) {
      if (!sdp) return sdp;
      return sdp.replace(/a=fmtp:(\d+) useinbandfec=1/gi, function (m, pt) {
        return 'a=fmtp:' + pt + ' useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=128000;maxplaybackrate=48000;minptime=10';
      });
    }

    function tunePc(pc) {
      if (!pc || pc.__audioTuned) return;
      pc.__audioTuned = true;
      var origOffer  = pc.createOffer.bind(pc), origAnswer = pc.createAnswer.bind(pc);
      pc.createOffer = function (o) { return origOffer(o).then(function (d) { d.sdp = tuneOpusSdp(d.sdp); return d; }); };
      pc.createAnswer = function (o) { return origAnswer(o).then(function (d) { d.sdp = tuneOpusSdp(d.sdp); return d; }); };
      try {
        if (typeof RTCRtpSender !== 'undefined' && typeof RTCRtpSender.getCapabilities === 'function' && pc.getTransceivers) {
          var caps = RTCRtpSender.getCapabilities('audio');
          if (caps && caps.codecs) {
            var opus = caps.codecs.filter(function (c) { return /opus/i.test(c.mimeType); });
            var rest = caps.codecs.filter(function (c) { return !/opus/i.test(c.mimeType); });
            pc.getTransceivers().forEach(function (t) { try { t.setCodecPreferences(opus.concat(rest)); } catch (e) {} });
          }
        }
      } catch (e) {}
    }

    function boostSender(media) {
      try {
        var pc = media && (media.peerConnection || media._pc); if (!pc) return;
        pc.getSenders().forEach(function (s) {
          if (!s.track || s.track.kind !== 'audio') return;
          try {
            var p = s.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}];
            p.encodings.forEach(function (enc) { enc.maxBitrate = 128000; enc.networkPriority = 'high'; enc.priority = 'high'; });
            s.setParameters(p).catch(function () {});
          } catch (e) {}
        });
      } catch (e) {}
    }

    (function installPcHook() {
      if (typeof RTCPeerConnection === 'undefined') return;
      var Orig = RTCPeerConnection;
      function Wrapped(cfg) { var pc = new Orig(cfg); tunePc(pc); return pc; }
      Wrapped.prototype = Orig.prototype;
      try { Object.setPrototypeOf(Wrapped, Orig); } catch (e) {}
      window.RTCPeerConnection = Wrapped;
    })();

    var PEER_OPTS = {
      debug: 0,
      config: { 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }, 
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ], 
        sdpSemantics: 'unified-plan' 
      }
    };

    /* =========================================================
       Main User Peer (Presence & Friend DMs)
       ========================================================= */
    var mainPeer = null;
    var friendConns = {}; 
    
    function initMainPeer() {
      if (mainPeer) mainPeer.destroy();
      mainPeer = new Peer('mc-user-' + ME.username, PEER_OPTS);
      
      mainPeer.on('open', function() { updateFriendsStatus(); });
      
      mainPeer.on('connection', function(c) {
        c.on('close', function() {
          var uname = c.peer.replace('mc-user-', '');
          delete friendConns[uname];
          updateFriendsStatus();
        });
      });
      
      mainPeer.on('call', function(incoming) {
        if (confirm('Incoming call from ' + incoming.peer.replace('mc-user-', '') + '. Accept?')) {
          Meet.acceptDirectCall(incoming);
        } else {
          incoming.close();
        }
      });
    }

    function connectToFriend(username) {
      if (friendConns[username] && friendConns[username].open) return friendConns[username];
      var c = mainPeer.connect('mc-user-' + username, { reliable: true });
      friendConns[username] = c;
      
      c.on('open', function() { updateFriendsStatus(); });
      c.on('close', function() { delete friendConns[username]; updateFriendsStatus(); });
      c.on('error', function() { delete friendConns[username]; updateFriendsStatus(); });
      return c;
    }

    function updateFriendsStatus() {
      Object.keys(friendConns).forEach(function(uname) {
        var isOnline = friendConns[uname] && friendConns[uname].open;
        var els = document.querySelectorAll('.friend-status-' + uname);
        els.forEach(function(el) {
          el.textContent = isOnline ? '🟢 Online' : '⚪ Offline';
          el.style.color = isOnline ? 'var(--ok)' : 'var(--muted)';
        });
      });
    }

    /* =========================================================
       Friends Logic (Supabase)
       ========================================================= */
    async function renderFriends() {
      var box = $('#friendList'); if (!box) return;
      box.innerHTML = '<div class="empty">Loading friends...</div>';
      
      var friends = [];
      if (supabase) {
        const { data, error } = await supabase
          .from('friends')
          .select('friend_id, profiles!friends_friend_id_fkey(username)')
          .eq('user_id', ME.id);
          
        if (data) {
          friends = data.map(d => ({ username: d.profiles.username, id: d.friend_id }));
        }
      }
      
      box.innerHTML = '';
      if (friends.length === 0) {
        box.innerHTML = '<div class="empty">No friends yet. Add someone by their username.</div>';
        return;
      }
      
      friends.forEach(function(f) {
        var el = document.createElement('div'); el.className = 'item';
        var grow = document.createElement('div'); grow.className = 'grow';
        var t = document.createElement('div'); t.className = 't'; t.textContent = f.username;
        var sub = document.createElement('div'); sub.className = 's friend-status-' + f.username; sub.textContent = '⚪ Offline';
        grow.appendChild(t); grow.appendChild(sub);
        
        var chatBtn = document.createElement('button'); chatBtn.className = 'btn small primary'; chatBtn.textContent = 'Chat';
        chatBtn.addEventListener('click', function() { openFriendChat(f.username); connectToFriend(f.username); });
        
        var delBtn = document.createElement('button'); delBtn.className = 'icon-btn'; delBtn.textContent = '🗑';
        delBtn.addEventListener('click', async function() {
          if (!confirm('Remove friend?')) return;
          if (supabase) { await supabase.from('friends').delete().eq('user_id', ME.id).eq('friend_id', f.id); }
          renderFriends();
        });
        
        el.appendChild(grow); el.appendChild(chatBtn); el.appendChild(delBtn);
        box.appendChild(el);
      });
      updateFriendsStatus();
    }

    $('#addFriendBtn').addEventListener('click', async function() {
      var uname = $('#addFriendInput').value.trim().toLowerCase();
      if (!uname || uname === ME.username) { toast('Invalid username'); return; }
      
      if (supabase) {
        const { data: profile, error } = await supabase.from('profiles').select('id').eq('username', uname).single();
        if (!profile) { toast('User not found'); return; }
        
        const { error: insertError } = await supabase.from('friends').insert({ user_id: ME.id, friend_id: profile.id });
        if (insertError) {
          if (insertError.code === '23505') toast('Already friends!');
          else toast('Error: ' + insertError.message);
          return;
        }
        
        $('#addFriendInput').value = ''; renderFriends(); connectToFriend(uname); toast('Friend added!');
      }
    });

    /* =========================================================
       Friend Chat Logic (Supabase Realtime)
       ========================================================= */
    var currentFriend = '';
    var messageSubscription = null;
    
    function openFriendChat(username) {
      currentFriend = username; $('#fcTitle').textContent = username; $('#fcInput').value = ''; show('scr-friend-chat');
      
      if (supabase) {
        loadMessages(username);
        if (messageSubscription) supabase.removeChannel(messageSubscription);
        
        messageSubscription = supabase
          .channel('public:messages')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${ME.id}` }, payload => {
            if (payload.new.sender_id === ME.id || payload.new.sender_id === currentFriend) {
              appendBubble($('#fcMsgList'), payload.new, ME.username);
            }
          })
          .subscribe();
      }
    }

    async function loadMessages(friendUsername) {
      var box = $('#fcMsgList'); if (!box) return;
      box.innerHTML = '<div class="bubble sys">Loading messages...</div>';
      
      if (supabase) {
        const { data: profile } = await supabase.from('profiles').select('id').eq('username', friendUsername).single();
        if (!profile) return;
        
        const { data: msgs } = await supabase.from('messages').select('*')
          .or(`and(sender_id.eq.${ME.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${ME.id})`)
          .order('created_at', { ascending: true }).limit(100);
          
        box.innerHTML = '';
        if (!msgs || msgs.length === 0) { box.innerHTML = '<div class="bubble sys">Say hi to ' + friendUsername + '!</div>'; }
        else { msgs.forEach(m => appendBubble(box, m, ME.username)); }
      }
    }

    async function sendFriendMsg() {
      var inp = $('#fcInput'); var v = inp.value.trim(); if (!v) return;
      
      if (supabase) {
        const { data: profile } = await supabase.from('profiles').select('id').eq('username', currentFriend).single();
        if (!profile) return;
        await supabase.from('messages').insert({ sender_id: ME.id, receiver_id: profile.id, content: v });
      }
      inp.value = '';
    }

    $('#fcSend').addEventListener('click', sendFriendMsg);
    $('#fcInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendFriendMsg(); });
    
    $('#fcCallBtn').addEventListener('click', function() {
      if (!currentFriend) return;
      var c = connectToFriend(currentFriend);
      if (!c || !c.open) { toast(currentFriend + ' is offline.'); return; }
      Meet.joinDirect(currentFriend);
    });

    /* =========================================================
       Image Upload Handling
       ========================================================= */
    function setupImageUpload(btnId, inputId, callback) {
      var btn = $('#' + btnId), input = $('#' + inputId);
      if (!btn || !input) return;
      btn.addEventListener('click', function() { input.click(); });
      input.addEventListener('change', function(e) {
        var file = e.target.files[0]; if (!file) return;
        if (file.size > 2 * 1024 * 1024) { toast('Image must be under 2MB'); return; }
        
        var reader = new FileReader();
        reader.onload = function(ev) { callback(ev.target.result); input.value = ''; };
        reader.readAsDataURL(file);
      });
    }

    /* =========================================================
       Group Chat Logic (Supabase)
       ========================================================= */
    var Group = {
      code: '', name: '', msgs: [], subscription: null,
      
      open: async function (code, name) {
        this.code = code; this.name = name || ('Group ' + code);
        $('#gTitle').textContent = this.name; $('#gSub').textContent = code; $('#msgInput').value = ''; show('scr-group');
        
        if (supabase) {
          const { data } = await supabase.from('messages').select('*').eq('group_id', code).order('created_at', { ascending: true }).limit(50);
          $('#msgList').innerHTML = '';
          if (data && data.length > 0) data.forEach(m => appendBubble($('#msgList'), m, ME.username));
          
          if (this.subscription) supabase.removeChannel(this.subscription);
          this.subscription = supabase
            .channel('group:' + code)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${code}` }, payload => {
              appendBubble($('#msgList'), payload.new, ME.username);
            })
            .subscribe();
        }
      },
      
      send: async function (text, imgData) {
        if (supabase) {
          await supabase.from('messages').insert({ sender_id: ME.id, group_id: this.code, content: text || null, image_url: imgData || null });
        }
      },
      
      close: function () { if (this.subscription) supabase.removeChannel(this.subscription); }
    };

    function appendBubble(container, m, myUsername) {
      if (!container) return;
      var senderName = m.profiles ? m.profiles.username : (m.sender_id === ME.id ? ME.username : 'User');
      var isMe = (m.sender_id === ME.id || m.sender === myUsername);
      
      var wrap = document.createElement('div'); wrap.className = 'bubble ' + (isMe ? 'me' : 'them');
      var meta = document.createElement('div'); meta.className = 'meta'; 
      meta.textContent = (isMe ? 'You' : senderName) + ' · ' + fmtTime(new Date(m.created_at || Date.now()).getTime());
      
      var body = document.createElement('div');
      if (m.content) { body.textContent = m.content; }
      if (m.image_url) {
        var img = document.createElement('img'); img.src = m.image_url; 
        img.onclick = function() { window.open(m.image_url, '_blank'); };
        body.appendChild(img);
      }
      
      wrap.appendChild(meta); wrap.appendChild(body); 
      container.appendChild(wrap); container.scrollTop = container.scrollHeight;
    }

    /* =========================================================
       Meeting Logic (PeerJS)
       ========================================================= */
    var Meet = {
      peer: null, conn: null, call: null, stream: null, code: '', title: '', host: false, ended: false, isDirect: false,

      join: async function (code, title) {
        this.isDirect = false; this._cleanup(); this.ended = false; this.code = code; this.title = title || 'Meeting';
        
        $('#meetTitle').textContent = this.title; $('#meetCode').textContent = code;
        $('#meetMsgs').innerHTML = ''; $('#meetChatDrawer').classList.remove('open'); $('#remoteVideo').srcObject = null;
        
        this.setStatus('Starting camera…'); this.overlay('Starting camera…'); show('scr-meet');
        await this._getMedia();
        this.setStatus('Waiting…'); this.overlay('Waiting for someone to join…'); 
        
        this.peer = new Peer('mc-mtg-' + norm(code), PEER_OPTS);
        this.peer.on('open', function () { this.host = true; Meet.setStatus('Hosting • waiting'); }.bind(this));
        this.peer.on('connection', function (c) { Meet.acceptConn(c); });
        this.peer.on('call', function (incoming) {
          if (Meet.call) { try { incoming.close(); } catch (e) {} return; }
          Meet.call = incoming; try { incoming.answer(Meet.stream); } catch (e) { console.warn(e); }
          Meet.pipeCall(incoming);
        });
        this.peer.on('error', function (err) {
          if (err.type === 'unavailable-id') {
            try { this.peer.destroy(); } catch (e) {} this.peer = null; 
            Meet.connectGuest('mc-mtg-' + norm(code));
          }
        }.bind(this));
      },

      joinDirect: async function (friendUsername) {
        this.isDirect = true; this._cleanup(); this.ended = false; this.code = friendUsername; this.title = friendUsername;
        
        $('#meetTitle').textContent = 'Call with ' + friendUsername; $('#meetCode').textContent = 'Direct';
        $('#meetMsgs').innerHTML = ''; $('#meetChatDrawer').classList.remove('open'); $('#remoteVideo').srcObject = null;
        
        this.setStatus('Calling…'); this.overlay('Calling ' + friendUsername + '…'); show('scr-meet');
        await this._getMedia();
        
        var media = mainPeer.call('mc-user-' + friendUsername, this.stream);
        if (!media) { toast('Call failed'); this.leave(); return; }
        this.call = media; this.pipeCall(media);
      },

      acceptDirectCall: async function (incoming) {
        this.isDirect = true; this._cleanup(); this.ended = false; this.code = incoming.peer.replace('mc-user-', ''); this.title = this.code;
        
        $('#meetTitle').textContent = 'Call with ' + this.code; $('#meetCode').textContent = 'Direct';
        $('#meetMsgs').innerHTML = ''; show('scr-meet');
        
        this.setStatus('Connecting…'); this.overlay('Connecting…'); await this._getMedia();
        this.call = incoming; try { incoming.answer(this.stream); } catch(e){}
        this.pipeCall(incoming);
      },

      _getMedia: async function() {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: AUDIO_CONSTRAINTS });
        } catch (e1) {
          try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS }); toast('Audio only'); }
          catch (e2) { this.stream = new MediaStream(); toast('No mic/cam access'); }
        }
        $('#localVideo').srcObject = this.stream;
      },

      connectGuest: function (targetId) {
        this.peer = new Peer(PEER_OPTS);
        this.peer.on('open', function () {
          Meet.setStatus('Connecting…');
          var c = Meet.peer.connect(targetId, { reliable: true });
          if (c) Meet.acceptConn(c);
          try { var media = Meet.peer.call(targetId, Meet.stream); if (media) { Meet.call = media; Meet.pipeCall(media); } } catch (e) {}
        });
        this.peer.on('error', function (err) {
          if (err.type === 'peer-unavailable') { Meet.setStatus('Not found'); Meet.overlay('Meeting not found.'); }
        });
      },

      acceptConn: function (c) {
        var self = this;
        if (this.conn && this.conn.open) { c.on('open', function () { c.send({ type: 'busy' }); c.close(); }); return; }
        this.conn = c;
        c.on('open', function () { self.setStatus('Connected'); self.hideOverlay(); });
        c.on('data', function (d) {
          if (!d || typeof d !== 'object') return;
          if (d.type === 'chat') appendBubble($('#meetMsgs'), { id: uid(), sender_id: d.sender_id, content: d.text, image_url: d.img, created_at: new Date() }, ME.username);
        });
        c.on('close', function () { self.conn = null; self.setStatus('Disconnected'); $('#remoteVideo').srcObject = null; self.overlay('Participant left.'); });
      },

      pipeCall: function (media) {
        var self = this;
        boostSender(media);
        media.on('stream', function (s) {
          boostSender(media); $('#remoteVideo').srcObject = s; self.hideOverlay(); self.setStatus('Connected • HD audio');
        });
        media.on('close', function () { $('#remoteVideo').srcObject = null; self.overlay('Call ended.'); });
      },

      setStatus: function (t) { $('#meetStatus').textContent = t; },
      overlay: function (t) { var o = $('#stageOverlay'); if (o) { o.textContent = t; o.style.display = 'flex'; } },
      hideOverlay: function () { var o = $('#stageOverlay'); if (o) o.style.display = 'none'; },

      send: function (text, imgData) {
        if (this.conn && this.conn.open) { this.conn.send({ type: 'chat', text: text || '', img: imgData || null, sender_id: ME.id }); }
        appendBubble($('#meetMsgs'), { id: uid(), sender_id: ME.id, content: text, image_url: imgData, created_at: new Date() }, ME.username);
      },

      toggleMic: function () { if (!this.stream) return; var t = this.stream.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; $('#toggleMic').classList.toggle('off', !t.enabled); } },
      toggleCam: function () { if (!this.stream) return; var t = this.stream.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; $('#toggleCam').classList.toggle('off', !t.enabled); } },

      leave: function () { this.ended = true; this._cleanup(); show('scr-home'); },

      _cleanup: function () {
        if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
        if (this.call) { try { this.call.close(); } catch (e) {} this.call = null; }
        if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
        if (this.stream) { this.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); this.stream = null; }
        $('#remoteVideo').srcObject = null; $('#localVideo').srcObject = null;
      }
    };

    /* =========================================================
       Initialize & Wire UI
       ========================================================= */
    $('#scr-home').addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'new') Meet.join(newCode(), 'Instant meeting');
      else if (act === 'join') { $('#joinCode').value = ''; show('scr-join'); }
      else if (act === 'schedule') { show('scr-schedule'); }
      else if (act === 'groups') { show('scr-groups'); }
      else if (act === 'friends') { renderFriends(); show('scr-friends'); }
    });

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-back]'); if (!b) return;
      var dest = b.getAttribute('data-back') || 'scr-home';
      if (dest === 'scr-groups') Group.close();
      show(dest);
    });

    $('#doJoin').addEventListener('click', function () {
      var code = $('#joinCode').value.trim();
      if (!norm(code)) { toast('Enter code'); return; }
      Meet.join(code, 'Meeting');
    });

    $('#toggleMic').addEventListener('click', function () { Meet.toggleMic(); });
    $('#toggleCam').addEventListener('click', function () { Meet.toggleCam(); });
    $('#leaveMeet').addEventListener('click', function () { Meet.leave(); });
    $('#meetChatBtn').addEventListener('click', function () { $('#meetChatDrawer').classList.toggle('open'); });
    $('#closeDrawer').addEventListener('click', function () { $('#meetChatDrawer').classList.remove('open'); });
    
    function sendMeetMsg() {
      var v = $('#meetInput').value.trim(); if (!v) return;
      Meet.send(v); $('#meetInput').value = '';
    }
    $('#meetSend').addEventListener('click', sendMeetMsg);
    $('#meetInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMeetMsg(); });
    setupImageUpload('mImgBtn', 'mImgInput', function(data) { Meet.send('', data); });

    $('#newGroupBtn').addEventListener('click', function () {
      var name = prompt('Group name:'); if (!name) return;
      Group.open(newCode(), name);
    });
    $('#joinGroupBtn').addEventListener('click', function () {
      var code = $('#grpCode').value.trim(); if (!code) return;
      Group.open(code, 'Group ' + code);
    });
    function sendGroupMsg() {
      var v = $('#msgInput').value.trim(); if (!v) return;
      Group.send(v); $('#msgInput').value = '';
    }
    $('#sendMsg').addEventListener('click', sendGroupMsg);
    $('#msgInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendGroupMsg(); });
    setupImageUpload('gImgBtn', 'gImgInput', function(data) { Group.send('', data); });

  } catch (fatalError) {
    var el = document.getElementById('error-overlay');
    if (el) {
      el.style.display = 'block';
      el.textContent = 'Fatal Initialization Error: \n' + fatalError.stack;
    }
  }
});
