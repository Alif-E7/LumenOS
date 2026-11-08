import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { RoleBadge } from "../components/RoleBadge";
import { Selector } from "../components/Selector";
import type { RoleId } from "../lib/constants";
import { createRoom, joinRoom } from "../api/client";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { saveMissionSession, loadMissionSession } from "../lib/mission";
import { MISSIONS } from "../lib/constants";

export function CoopLobbyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialAction = searchParams.get("action") || "create";

  const [mode, setMode] = useState<"create" | "join" | "in_room">(
    searchParams.get("code") ? "join" : initialAction === "join" ? "join" : "create"
  );

  const [hostName, setHostName] = useState("Commander");
  const [displayName, setDisplayName] = useState("Cadet");
  const [roomCodeInput, setRoomCodeInput] = useState(searchParams.get("code") || "");
  const [selectedMission, setSelectedMission] = useState<string>("wildfire");

  // Room state
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string>("");
  const [myDisplayName, setMyDisplayName] = useState<string>("");
  const [isHost, setIsHost] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Restore saved session if already in room
  useEffect(() => {
    const saved = loadMissionSession();
    if (saved && saved.mode === "coop" && saved.roomCode) {
      setRoomCode(saved.roomCode);
      setPlayerId(saved.playerId);
      setMyDisplayName("You");
      setMode("in_room");
    }
  }, []);

  // WebSocket hook
  const room = useRoomSocket(roomCode, playerId, myDisplayName);

  // Transition to operate screen when game starts
  useEffect(() => {
    if (room.phase === "playing" && room.gameState) {
      const missionName =
        MISSIONS[selectedMission as keyof typeof MISSIONS]?.name || "Orbital Mission";
      saveMissionSession({
        mode: "coop",
        missionId: selectedMission,
        missionName,
        spacecraftId: null,
        sessionId: room.gameState.session_id,
        playerId,
        roomCode,
      });
      navigate("/operate");
    }
  }, [room.phase, room.gameState, selectedMission, playerId, roomCode, navigate]);

  const handleCreateRoom = async () => {
    if (!hostName.trim()) return;
    setLoading(true);
    setApiError(null);
    try {
      const resp = await createRoom(hostName.trim());
      setRoomCode(resp.room_code);
      setPlayerId(resp.player_id);
      setMyDisplayName(hostName.trim());
      setIsHost(true);
      setMode("in_room");
      saveMissionSession({
        mode: "coop",
        missionId: selectedMission,
        missionName: MISSIONS[selectedMission as keyof typeof MISSIONS]?.name || "Mission",
        spacecraftId: null,
        sessionId: null,
        playerId: resp.player_id,
        roomCode: resp.room_code,
      });
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    const code = roomCodeInput.trim().toUpperCase();
    if (!code || !displayName.trim()) return;
    setLoading(true);
    setApiError(null);
    try {
      const resp = await joinRoom(code, displayName.trim());
      setRoomCode(code);
      setPlayerId(resp.player_id);
      setMyDisplayName(displayName.trim());
      setIsHost(false);
      setMode("in_room");
      saveMissionSession({
        mode: "coop",
        missionId: "wildfire",
        missionName: "Wildfire Scout",
        spacecraftId: null,
        sessionId: null,
        playerId: resp.player_id,
        roomCode: code,
      });
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReady = () => {
    room.send({ command: "ready" });
  };

  const handleStartMission = () => {
    room.send({ command: "start", mission_id: selectedMission });
  };

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const me = room.participants.find((p) => p.player_id === playerId);
  const myReady = me?.ready ?? false;
  const allReady = room.participants.length > 0 && room.participants.every((p) => p.ready);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Creation / Join View */}
      {mode !== "in_room" && (
        <>
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-white mb-2">Cooperative Mission Room</h1>
            <p className="text-slate-400">
              Share one live spacecraft simulation with 2–4 players. No account required.
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-8">
            <Button
              variant={mode === "create" ? "primary" : "secondary"}
              onClick={() => setMode("create")}
            >
              Create New Room
            </Button>
            <Button
              variant={mode === "join" ? "primary" : "secondary"}
              onClick={() => setMode("join")}
            >
              Join Existing Room
            </Button>
          </div>

          {apiError && (
            <Card title="Error" icon="⚠️" className="mb-6 border-red-500/40">
              <p className="text-sm text-red-400">{apiError}</p>
            </Card>
          )}

          {mode === "create" ? (
            <Card title="Create Room (Host)" icon="👑" className="max-w-xl mx-auto">
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Your Host Display Name
                  </label>
                  <input
                    type="text"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="Enter callsign or name..."
                    className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700
                               text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    maxLength={30}
                  />
                </div>

                <Selector
                  label="Select Mission Scenario"
                  value={selectedMission}
                  options={[
                    { value: "wildfire", label: "🔥 Wildfire Scout — Eyes on Fire (Tier 2)" },
                    { value: "flood", label: "🌊 Flood Scout — Rising Waters (Tier 3)" },
                    { value: "solar_storm", label: "☀️ Solar Storm Sentinel — Watch the Sun (Tier 4)" },
                    { value: "volcano", label: "🌋 Volcano Watch — Fire Beneath the Earth (Tier 3)" },
                  ]}
                  onChange={setSelectedMission}
                  hint="All 4 mission scenarios support cooperative multiplayer with role-specific panels."
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => navigate("/mode")}>
                  Cancel
                </Button>
                <Button onClick={handleCreateRoom} disabled={loading || !hostName.trim()}>
                  {loading ? "Creating..." : "Create Room & Enter Lobby →"}
                </Button>
              </div>
            </Card>
          ) : (
            <Card title="Join Room" icon="🔑" className="max-w-xl mx-auto">
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    6-Character Room Code
                  </label>
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. A3F1B2"
                    className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700
                               text-white font-mono text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                    maxLength={6}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Your Guest Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter callsign or name..."
                    className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700
                               text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    maxLength={30}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => navigate("/mode")}>
                  Cancel
                </Button>
                <Button
                  onClick={handleJoinRoom}
                  disabled={loading || roomCodeInput.trim().length !== 6 || !displayName.trim()}
                >
                  {loading ? "Joining..." : "Join Room →"}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* In-Room Lobby View */}
      {mode === "in_room" && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-white">Mission Briefing Room</h1>
                <StatusBadge
                  label={
                    room.status === "open"
                      ? "LIVE CONNECTED"
                      : room.status === "connecting"
                      ? "CONNECTING..."
                      : "DISCONNECTED"
                  }
                  variant={room.status === "open" ? "success" : "warning"}
                />
              </div>
              <p className="text-slate-400 text-sm mt-1">
                Room participants will share one live spacecraft simulation state.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-4 py-2 rounded-lg">
              <span className="text-xs text-slate-400">ROOM CODE:</span>
              <span className="font-mono text-xl font-bold text-blue-400">{roomCode}</span>
              <Button size="sm" variant="ghost" onClick={handleCopyCode}>
                {copied ? "Copied!" : "📋 Copy"}
              </Button>
            </div>
          </div>

          {room.lastError && (
            <Card title="Room Alert" icon="⚠️" className="mb-6 border-red-500/40">
              <p className="text-sm text-red-400">{room.lastError}</p>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Participants list */}
            <Card title={`Crew Roster (${room.participants.length}/4)`} icon="👥" className="md:col-span-2">
              <div className="space-y-3">
                {room.participants.length === 0 ? (
                  <p className="text-sm text-slate-500">Connecting to room...</p>
                ) : (
                  room.participants.map((p) => {
                    const isMe = p.player_id === playerId;
                    return (
                      <div
                        key={p.player_id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          isMe
                            ? "border-blue-500/50 bg-blue-950/20"
                            : "border-slate-800 bg-slate-900/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{p.is_host ? "👑" : "🧑🚀"}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{p.display_name}</span>
                              {isMe && <span className="text-xs text-blue-400">(You)</span>}
                              {p.is_host && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  HOST
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {p.connected ? "Connected" : "Disconnected (reconnecting...)"}
                            </p>
                          </div>
                        </div>

                        <div>
                          <StatusBadge
                            label={p.ready ? "READY" : "NOT READY"}
                            variant={p.ready ? "success" : "neutral"}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Role Bundling Preview */}
            <Card title="Station Role Assignment" icon="🎖️">
              <p className="text-xs text-slate-400 mb-3">
                Server-authoritative role distribution:
              </p>
              {room.participants.length > 0 && Object.keys(room.roles).length > 0 ? (
                <div className="space-y-2 mb-4">
                  {room.participants.map((p) => {
                    const assigned = (room.roles[p.player_id] ?? p.roles ?? []) as RoleId[];
                    return (
                      <div
                        key={p.player_id}
                        className="p-2 rounded bg-slate-800/60 border border-slate-700/50 flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-semibold text-slate-200">
                          {p.display_name} {p.is_host && "(Host)"}:
                        </span>
                        <div className="flex gap-1 flex-wrap">
                          {assigned.map((r) => (
                            <RoleBadge key={r} role={r} size="sm" />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="space-y-2 text-xs">
                <div className="p-2 rounded bg-slate-800/40 border border-slate-700/40">
                  <span className="font-semibold text-slate-200">4 Players:</span> 1 role each (Director, Systems, Science, Flight)
                </div>
                <div className="p-2 rounded bg-slate-800/40 border border-slate-700/40">
                  <span className="font-semibold text-slate-200">3 Players:</span> Director + Science bundle, Flight, Systems
                </div>
                <div className="p-2 rounded bg-slate-800/40 border border-slate-700/40">
                  <span className="font-semibold text-slate-200">2 Players:</span> 2 roles per player (Director+Science, Flight+Systems)
                </div>
                <div className="p-2 rounded bg-slate-800/40 border border-slate-700/40">
                  <span className="font-semibold text-slate-200">1 Player:</span> All Stations
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800">
                <p className="text-[11px] text-slate-500">
                  Stations have role-specific controls enforced by server permissions. Host can reassign roles dynamically.
                </p>
              </div>
            </Card>
          </div>

          {/* Lobby Actions */}
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant={myReady ? "secondary" : "primary"}
                onClick={handleToggleReady}
              >
                {myReady ? "Cancel Ready" : "✓ Mark as Ready"}
              </Button>
              <span className="text-xs text-slate-400">
                {allReady
                  ? "All crew members ready for ignition!"
                  : "Waiting for all crew members to ready up..."}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {(isHost || me?.is_host) ? (
                <Button
                  size="lg"
                  onClick={handleStartMission}
                  disabled={room.participants.length < 1}
                >
                  🚀 Launch Mission for Crew
                </Button>
              ) : (
                <span className="text-xs text-slate-500">
                  Waiting for host to launch the mission...
                </span>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setRoomCode(null);
                  setMode("create");
                }}
              >
                Leave Room
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
