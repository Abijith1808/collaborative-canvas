"use client";

import { useCanvasStore } from "@/state/canvasStore";

export default function UserList() {
  const { users, currentUserId } = useCanvasStore();

  return (
    <aside
      className="w-48 shrink-0 flex flex-col hidden lg:flex"
      style={{
        background: "var(--toolbar-bg)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      <div
        className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-gray-400"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        Online — {users.length}
      </div>

      <div className="flex-1 overflow-y-auto user-list p-2">
        {users.length === 0 ? (
          <p className="text-xs text-gray-600 px-2 py-3">No users yet</p>
        ) : (
          <ul className="space-y-1">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm"
                style={{
                  background:
                    user.id === currentUserId
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                }}
              >
                {/* Color dot */}
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: user.color }}
                />
                <span
                  className="truncate"
                  style={{
                    color:
                      user.id === currentUserId ? "white" : "rgba(255,255,255,0.7)",
                  }}
                >
                  {user.name}
                  {user.id === currentUserId && (
                    <span className="ml-1 text-[10px] text-gray-500">(you)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
