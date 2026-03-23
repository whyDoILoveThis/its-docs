"use client";
import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { v4 } from "uuid";
import { useOfflineFetch } from "@/hooks/useOfflineFetch";
import { updateCachedProject } from "@/hooks/useOfflineStore";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ItsConfirmProvider";
import EditIcon from "@/components/icons/EditIcon";
import TrashIcon from "@/components/icons/TrashIcon";
import {
  FiRotateCcw,
  FiRotateCw,
  FiPlus,
  FiColumns,
  FiChevronsUp,
  FiScissors,
} from "react-icons/fi";

interface Props {
  theProject: Project;
  projUid: string;
  diagram: PDMDiagram;
  refetchProject: () => void;
  onDelete: () => void;
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 56;
const LAYER_GAP = 100;
const NODE_GAP = 28;
const PADDING = 50;
const DEFAULT_COLOR = "#d4d4d8";

function computeLayout(
  nodes: PDMNode[],
  edges: PDMEdge[],
  orientation: "horizontal" | "vertical",
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map();

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach((n) => {
    adj.set(n.uid, []);
    inDegree.set(n.uid, 0);
  });

  edges.forEach((e) => {
    if (adj.has(e.fromNodeUid) && inDegree.has(e.toNodeUid)) {
      adj.get(e.fromNodeUid)!.push(e.toNodeUid);
      inDegree.set(e.toNodeUid, (inDegree.get(e.toNodeUid) || 0) + 1);
    }
  });

  const layers: string[][] = [];
  const queue: string[] = [];
  const visited = new Set<string>();

  nodes.forEach((n) => {
    if (inDegree.get(n.uid) === 0) queue.push(n.uid);
  });

  while (queue.length > 0) {
    const layer = [...queue];
    layers.push(layer);
    queue.length = 0;

    for (const uid of layer) {
      visited.add(uid);
      for (const neighbor of adj.get(uid) || []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        if (inDegree.get(neighbor) === 0 && !visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  const layered = new Set(layers.flat());
  const remaining = nodes.filter((n) => !layered.has(n.uid));
  if (remaining.length > 0) {
    layers.push(remaining.map((n) => n.uid));
  }

  const maxLayerSize = Math.max(...layers.map((l) => l.length));
  const positions = new Map<string, { x: number; y: number }>();

  layers.forEach((layer, layerIndex) => {
    const span =
      orientation === "horizontal"
        ? (NODE_HEIGHT + NODE_GAP) * layer.length
        : (NODE_WIDTH + NODE_GAP) * layer.length;
    const maxSpan =
      orientation === "horizontal"
        ? (NODE_HEIGHT + NODE_GAP) * maxLayerSize
        : (NODE_WIDTH + NODE_GAP) * maxLayerSize;
    const offset = (maxSpan - span) / 2;

    layer.forEach((uid, nodeIndex) => {
      if (orientation === "horizontal") {
        positions.set(uid, {
          x: PADDING + layerIndex * (NODE_WIDTH + LAYER_GAP),
          y: PADDING + offset + nodeIndex * (NODE_HEIGHT + NODE_GAP),
        });
      } else {
        positions.set(uid, {
          x: PADDING + offset + nodeIndex * (NODE_WIDTH + NODE_GAP),
          y: PADDING + layerIndex * (NODE_HEIGHT + LAYER_GAP),
        });
      }
    });
  });

  return positions;
}

const PDMDiagram = ({
  theProject,
  projUid,
  diagram,
  refetchProject,
  onDelete,
}: Props) => {
  const { userId } = useAuth();
  const { toast } = useToast();
  const { ItsConfirm } = useConfirm();
  const { offlineFetch } = useOfflineFetch();
  const isOwner = userId === theProject.creatorUid;

  const [nodes, setNodes] = useState<PDMNode[]>(diagram.nodes || []);
  const [edges, setEdges] = useState<PDMEdge[]>(diagram.edges || []);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    (diagram.orientation as "horizontal" | "vertical") || "horizontal",
  );
  const [title, setTitle] = useState(diagram.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [selectedNodeUid, setSelectedNodeUid] = useState<string | null>(null);
  const [selectedEdgeUid, setSelectedEdgeUid] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [colorHistory, setColorHistory] = useState<string[]>([]);

  // --- History (full timeline, never lost) ---
  interface Snapshot {
    nodes: PDMNode[];
    edges: PDMEdge[];
    orientation: "horizontal" | "vertical";
    title: string;
    label: string;
  }

  const history = useRef<Snapshot[]>([]);
  const historyIndex = useRef(-1); // -1 = "current live state"
  const [, forceRender] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const historyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pushSnapshot = useCallback(
    (actionLabel: string) => {
      history.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        orientation,
        title,
        label: actionLabel,
      });
      historyIndex.current = -1;
      forceRender((n) => n + 1);
    },
    [nodes, edges, orientation, title],
  );

  const applySnapshot = useCallback((index: number) => {
    const snap = history.current[index];
    if (!snap) return;
    historyIndex.current = index;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setOrientation(snap.orientation);
    setTitle(snap.title);
    setHasChanges(true);
    forceRender((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    if (history.current.length === 0) return;
    // If we're at "live" state, save it first so we can get back
    if (historyIndex.current === -1) {
      history.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        orientation,
        title,
        label: "(current)",
      });
      applySnapshot(history.current.length - 2);
    } else if (historyIndex.current > 0) {
      applySnapshot(historyIndex.current - 1);
    }
  }, [nodes, edges, orientation, title, applySnapshot]);

  const redo = useCallback(() => {
    if (historyIndex.current === -1) return;
    if (historyIndex.current < history.current.length - 1) {
      applySnapshot(historyIndex.current + 1);
    }
  }, [applySnapshot]);

  const canUndo =
    history.current.length > 0 &&
    (historyIndex.current === -1 || historyIndex.current > 0);
  const canRedo =
    historyIndex.current !== -1 &&
    historyIndex.current < history.current.length - 1;

  const positions = useMemo(
    () => computeLayout(nodes, edges, orientation),
    [nodes, edges, orientation],
  );

  const svgWidth = useMemo(() => {
    if (positions.size === 0) return 400;
    let maxX = 0;
    positions.forEach((pos) => {
      maxX = Math.max(maxX, pos.x + NODE_WIDTH);
    });
    return maxX + PADDING;
  }, [positions]);

  const svgHeight = useMemo(() => {
    if (positions.size === 0) return 200;
    let maxY = 0;
    positions.forEach((pos) => {
      maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
    });
    return maxY + PADDING;
  }, [positions]);

  const markChanged = () => setHasChanges(true);

  const addNode = () => {
    pushSnapshot("Add node");
    const newNode: PDMNode = {
      uid: v4(),
      label: "New Node",
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeUid(newNode.uid);
    setSelectedEdgeUid(null);
    markChanged();
  };

  const deleteNode = (uid: string) => {
    pushSnapshot("Delete node");
    setNodes(nodes.filter((n) => n.uid !== uid));
    setEdges(edges.filter((e) => e.fromNodeUid !== uid && e.toNodeUid !== uid));
    setSelectedNodeUid(null);
    markChanged();
  };

  const deleteEdge = (uid: string) => {
    pushSnapshot("Delete edge");
    setEdges(edges.filter((e) => e.uid !== uid));
    setSelectedEdgeUid(null);
    markChanged();
  };

  const disconnectNode = (uid: string) => {
    const connected = edges.filter(
      (e) => e.fromNodeUid === uid || e.toNodeUid === uid,
    );
    if (connected.length === 0) return;
    pushSnapshot("Disconnect node");
    setEdges(edges.filter((e) => e.fromNodeUid !== uid && e.toNodeUid !== uid));
    markChanged();
  };

  // For label/color we debounce the snapshot: push only on the first
  // change after the last snapshot so rapid typing doesn't flood the stack.
  const labelSnapshotPushed = useRef(false);

  const updateNodeLabel = (uid: string, label: string) => {
    if (!labelSnapshotPushed.current) {
      pushSnapshot("Edit label");
      labelSnapshotPushed.current = true;
    }
    setNodes(nodes.map((n) => (n.uid === uid ? { ...n, label } : n)));
    markChanged();
  };

  const commitLabelSnapshot = () => {
    labelSnapshotPushed.current = false;
  };

  const commitColor = (color: string | undefined) => {
    labelSnapshotPushed.current = false;
    if (color && color !== DEFAULT_COLOR) {
      setColorHistory((prev) =>
        prev.includes(color) ? prev : [...prev, color],
      );
    }
  };

  const removeColorFromHistory = async (color: string) => {
    const confirmed = await ItsConfirm("Remove this color from history?");
    if (!confirmed) return;
    setColorHistory((prev) => prev.filter((c) => c !== color));
  };

  const updateNodeColor = (uid: string, color: string) => {
    if (!labelSnapshotPushed.current) {
      pushSnapshot("Change node color");
      labelSnapshotPushed.current = true;
    }
    setNodes(nodes.map((n) => (n.uid === uid ? { ...n, color } : n)));
    markChanged();
  };

  const resetNodeColor = (uid: string) => {
    pushSnapshot("Reset node color");
    setNodes(
      nodes.map((n) => (n.uid === uid ? { uid: n.uid, label: n.label } : n)),
    );
    markChanged();
  };

  const updateEdgeColor = (uid: string, color: string) => {
    if (!labelSnapshotPushed.current) {
      pushSnapshot("Change edge color");
      labelSnapshotPushed.current = true;
    }
    setEdges(edges.map((e) => (e.uid === uid ? { ...e, color } : e)));
    markChanged();
  };

  const resetEdgeColor = (uid: string) => {
    pushSnapshot("Reset edge color");
    setEdges(
      edges.map((e) =>
        e.uid === uid
          ? { uid: e.uid, fromNodeUid: e.fromNodeUid, toNodeUid: e.toNodeUid }
          : e,
      ),
    );
    markChanged();
  };

  const handleNodeClick = (uid: string) => {
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(uid);
      } else if (connectFrom !== uid) {
        const exists = edges.some(
          (e) => e.fromNodeUid === connectFrom && e.toNodeUid === uid,
        );
        if (!exists) {
          pushSnapshot("Connect nodes");
          setEdges([
            ...edges,
            { uid: v4(), fromNodeUid: connectFrom, toNodeUid: uid },
          ]);
          markChanged();
        }
        setConnectFrom(null);
        setConnectMode(false);
      }
    } else {
      setSelectedNodeUid(uid === selectedNodeUid ? null : uid);
      setSelectedEdgeUid(null);
    }
  };

  const handleEdgeClick = (uid: string) => {
    if (!connectMode) {
      setSelectedEdgeUid(uid === selectedEdgeUid ? null : uid);
      setSelectedNodeUid(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await offlineFetch({
      label: `Save diagram "${title}"`,
      method: "PUT",
      url: "/api/updatePDM",
      body: {
        projUid,
        diagramUid: diagram.uid,
        updates: { nodes, edges, orientation, title },
      },
    });
    if (result) {
      setHasChanges(false);
      refetchProject();
      toast({ title: "Diagram saved", variant: "green" });
    } else {
      // Offline — optimistically update cache
      updateCachedProject(projUid, (p) => ({
        ...p,
        pdmDiagrams: p.pdmDiagrams?.map((d) =>
          d.uid === diagram.uid
            ? { ...d, nodes, edges, orientation, title }
            : d,
        ),
      }));
      setHasChanges(false);
      refetchProject();
      toast({ title: "Diagram queued offline", variant: "blue" });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    const confirmed = await ItsConfirm("Delete this diagram?");
    if (!confirmed) return;

    const result = await offlineFetch({
      label: `Delete diagram "${title}"`,
      method: "DELETE",
      url: "/api/deletePDM",
      body: { projUid, diagramUid: diagram.uid },
    });

    if (!result) {
      // Offline — optimistically remove from cache
      updateCachedProject(projUid, (p) => ({
        ...p,
        pdmDiagrams: p.pdmDiagrams?.filter((d) => d.uid !== diagram.uid),
      }));
    }

    refetchProject();
    onDelete();
    toast({
      title: result ? "Diagram deleted" : "Delete queued offline",
      variant: result ? "green" : "blue",
    });
  };

  const deselect = () => {
    setSelectedNodeUid(null);
    setSelectedEdgeUid(null);
    if (connectMode) {
      setConnectMode(false);
      setConnectFrom(null);
    }
  };

  const selectedNode = nodes.find((n) => n.uid === selectedNodeUid);
  const selectedEdge = edges.find((e) => e.uid === selectedEdgeUid);

  const uniqueEdgeColors = useMemo(() => {
    const colors = new Set<string>();
    edges.forEach((e) => colors.add(e.color || DEFAULT_COLOR));
    return [...colors];
  }, [edges]);

  const markerIdForColor = (color: string) =>
    `arrow-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  const getEdgePath = (edge: PDMEdge) => {
    const from = positions.get(edge.fromNodeUid);
    const to = positions.get(edge.toNodeUid);
    if (!from || !to) return "";

    if (orientation === "horizontal") {
      const sx = from.x + NODE_WIDTH;
      const sy = from.y + NODE_HEIGHT / 2;
      const tx = to.x;
      const ty = to.y + NODE_HEIGHT / 2;
      const mx = (sx + tx) / 2;
      return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
    } else {
      const sx = from.x + NODE_WIDTH / 2;
      const sy = from.y + NODE_HEIGHT;
      const tx = to.x + NODE_WIDTH / 2;
      const ty = to.y;
      const my = (sy + ty) / 2;
      return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
    }
  };

  return (
    <div className="w-full max-w-4xl flex flex-col items-center gap-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        {editingTitle && isOwner ? (
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markChanged();
            }}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
            className="input text-center text-lg font-bold"
            autoFocus
          />
        ) : (
          <h2
            className="font-bold text-xl cursor-default"
            onClick={() => isOwner && setEditingTitle(true)}
          >
            {title}
          </h2>
        )}
        {isOwner && !editingTitle && (
          <button
            onClick={() => setEditingTitle(true)}
            className="btn btn-xs btn-ghost"
          >
            <EditIcon />
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-center">
        <button
          onClick={() => {
            pushSnapshot("Toggle orientation");
            setOrientation(
              orientation === "horizontal" ? "vertical" : "horizontal",
            );
            markChanged();
          }}
          className="btn btn-sm btn-outline"
          title={orientation === "horizontal" ? "Vertical" : "Horizontal"}
        >
          {orientation === "horizontal" ? <FiChevronsUp /> : <FiColumns />}
        </button>

        {isOwner && (
          <>
            <button
              onClick={undo}
              disabled={!canUndo}
              className="btn btn-sm btn-outline"
              title="Undo"
            >
              <FiRotateCcw />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="btn btn-sm btn-outline"
              title="Redo"
            >
              <FiRotateCw />
            </button>
            <div className="relative" ref={historyDropdownRef}>
              <button
                onClick={() => setShowHistory(!showHistory)}
                disabled={history.current.length === 0}
                className="btn btn-sm btn-outline btn-squish"
              >
                History ({history.current.length})
              </button>
              {showHistory && history.current.length > 0 && (
                <div className="absolute top-full mt-1 right-0 min-w-[180px] max-h-[240px] overflow-y-auto rounded-lg border border-slate-500/20 bg-slate-900/95 shadow-lg z-50">
                  <ul className="py-1">
                    {[...history.current].reverse().map((snap, revIdx) => {
                      const idx = history.current.length - 1 - revIdx;
                      const isCurrent = idx === historyIndex.current;
                      return (
                        <li
                          key={idx}
                          onClick={() => {
                            applySnapshot(idx);
                            setShowHistory(false);
                          }}
                          className={`px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                            isCurrent
                              ? "bg-slate-500/20 text-white"
                              : "text-slate-400 hover:bg-slate-500/10 hover:text-slate-200"
                          }`}
                        >
                          <span className="mr-2 text-slate-600">
                            {idx + 1}.
                          </span>
                          {snap.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <button
              onClick={addNode}
              className="btn btn-sm btn-green"
              title="Add node"
            >
              <FiPlus />
            </button>
            <button
              onClick={() => {
                setConnectMode(!connectMode);
                setConnectFrom(null);
              }}
              className={`btn btn-sm btn-squish ${connectMode ? "btn-purple" : "btn-outline"}`}
            >
              {connectMode
                ? connectFrom
                  ? "Click target…"
                  : "Click source…"
                : "Connect"}
            </button>
            <button
              onClick={handleDelete}
              className="btn btn-sm btn-red btn-squish"
            >
              <TrashIcon />
            </button>
            {hasChanges && (
              <button
                onClick={handleSave}
                className="btn btn-sm btn-green btn-squish"
                disabled={saving}
              >
                {saving ? <LoaderSpinSmall /> : "Save"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Edit panel for selected node */}
      {isOwner && selectedNode && (
        <div className="flex flex-col gap-2 p-3 rounded-lg border border-slate-500/20 bg-slate-400/5">
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              value={selectedNode.label}
              onChange={(e) =>
                updateNodeLabel(selectedNode.uid, e.target.value)
              }
              onBlur={commitLabelSnapshot}
              className="input text-sm max-w-[160px]"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              Color
              <input
                type="color"
                value={selectedNode.color || DEFAULT_COLOR}
                onChange={(e) =>
                  updateNodeColor(selectedNode.uid, e.target.value)
                }
                onBlur={() => commitColor(selectedNode.color)}
                className="w-7 h-7 rounded cursor-pointer bg-transparent border-none"
              />
            </label>
            {selectedNode.color && (
              <button
                onClick={() => resetNodeColor(selectedNode.uid)}
                className="btn btn-xs btn-ghost text-slate-500"
              >
                Reset
              </button>
            )}
            <button
              onClick={() => disconnectNode(selectedNode.uid)}
              disabled={
                !edges.some(
                  (e) =>
                    e.fromNodeUid === selectedNode.uid ||
                    e.toNodeUid === selectedNode.uid,
                )
              }
              className="btn btn-xs btn-outline btn-squish"
              title="Disconnect all edges"
            >
              <FiScissors />
            </button>
            <button
              onClick={() => deleteNode(selectedNode.uid)}
              className="btn btn-xs btn-red btn-squish"
            >
              Delete
            </button>
          </div>
          {colorHistory.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {colorHistory.map((c) => (
                <div key={c} className="relative group">
                  <button
                    onClick={() => {
                      pushSnapshot("Apply saved color");
                      updateNodeColor(selectedNode.uid, c);
                      commitColor(c);
                    }}
                    className="w-5 h-5 rounded-full border border-slate-500/30 cursor-pointer transition-transform hover:scale-125"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeColorFromHistory(c);
                    }}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 text-[8px] leading-none items-center justify-center hidden group-hover:flex border border-slate-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit panel for selected edge */}
      {isOwner && selectedEdge && (
        <div className="flex flex-col gap-2 p-3 rounded-lg border border-slate-500/20 bg-slate-400/5">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-xs text-slate-400">
              {nodes.find((n) => n.uid === selectedEdge.fromNodeUid)?.label} →{" "}
              {nodes.find((n) => n.uid === selectedEdge.toNodeUid)?.label}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              Color
              <input
                type="color"
                value={selectedEdge.color || DEFAULT_COLOR}
                onChange={(e) =>
                  updateEdgeColor(selectedEdge.uid, e.target.value)
                }
                onBlur={() => commitColor(selectedEdge.color)}
                className="w-7 h-7 rounded cursor-pointer bg-transparent border-none"
              />
            </label>
            {selectedEdge.color && (
              <button
                onClick={() => resetEdgeColor(selectedEdge.uid)}
                className="btn btn-xs btn-ghost text-slate-500"
              >
                Reset
              </button>
            )}
            <button
              onClick={() => deleteEdge(selectedEdge.uid)}
              className="btn btn-xs btn-red btn-squish"
            >
              Delete
            </button>
          </div>
          {colorHistory.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {colorHistory.map((c) => (
                <div key={c} className="relative group">
                  <button
                    onClick={() => {
                      pushSnapshot("Apply saved color");
                      updateEdgeColor(selectedEdge.uid, c);
                      commitColor(c);
                    }}
                    className="w-5 h-5 rounded-full border border-slate-500/30 cursor-pointer transition-transform hover:scale-125"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeColorFromHistory(c);
                    }}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 text-[8px] leading-none items-center justify-center hidden group-hover:flex border border-slate-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SVG diagram */}
      <div
        className="w-full overflow-auto rounded-lg border border-slate-500/15 bg-slate-400/[0.03]"
        onClick={deselect}
      >
        {nodes.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
            {isOwner ? "Add a node to get started" : "No nodes in this diagram"}
          </div>
        ) : (
          <svg
            width={svgWidth}
            height={svgHeight}
            className="min-w-full"
            style={{ minHeight: "200px" }}
          >
            <defs>
              {uniqueEdgeColors.map((color) => (
                <marker
                  key={color}
                  id={markerIdForColor(color)}
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 10 3.5, 0 7"
                    fill={color}
                    fillOpacity={0.7}
                  />
                </marker>
              ))}
            </defs>

            {/* Edges */}
            {edges.map((edge) => {
              const color = edge.color || DEFAULT_COLOR;
              const isSelected = edge.uid === selectedEdgeUid;
              return (
                <path
                  key={edge.uid}
                  d={getEdgePath(edge)}
                  fill="none"
                  stroke={color}
                  strokeOpacity={isSelected ? 0.9 : 0.5}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  markerEnd={`url(#${markerIdForColor(color)})`}
                  className="cursor-pointer"
                  style={{
                    transition: "stroke-opacity 0.15s, stroke-width 0.15s",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdgeClick(edge.uid);
                  }}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const pos = positions.get(node.uid);
              if (!pos) return null;
              const color = node.color || DEFAULT_COLOR;
              const isSelected = node.uid === selectedNodeUid;
              const isConnecting = connectFrom === node.uid;

              return (
                <g
                  key={node.uid}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node.uid);
                  }}
                >
                  {isSelected && (
                    <rect
                      x={pos.x - 3}
                      y={pos.y - 3}
                      width={NODE_WIDTH + 6}
                      height={NODE_HEIGHT + 6}
                      rx={10}
                      ry={10}
                      fill="none"
                      stroke="#4ade80"
                      strokeOpacity={0.7}
                      strokeWidth={2}
                      style={{ transition: "all 0.15s" }}
                    />
                  )}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={8}
                    ry={8}
                    fill={color}
                    fillOpacity={0.3}
                    stroke={color}
                    strokeOpacity={0.7}
                    strokeWidth={1}
                    style={{ transition: "all 0.15s" }}
                  />
                  <text
                    x={pos.x + NODE_WIDTH / 2}
                    y={pos.y + NODE_HEIGHT / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-current pointer-events-none select-none"
                    style={{ fontSize: "13px" }}
                  >
                    {node.label.length > 18
                      ? node.label.slice(0, 18) + "…"
                      : node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};

export default PDMDiagram;
