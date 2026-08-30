import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import AppChat from "./chat/App";
import { ChatProvider } from "./chat/context/ChatContext";
import AccessTokenGate from "./auth/AccessTokenGate";

function ProtectedChat() {
  return (
    <AccessTokenGate>
      <ChatProvider>
        <AppChat />
      </ChatProvider>
    </AccessTokenGate>
  );
}

const AppAdmin = lazy(() => import("./admin/App"));
const ContextProvider = lazy(() =>
  import("./admin/components/Context/Context"),
);

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<ProtectedChat />}
      />
      <Route
        path="/chat"
        element={<ProtectedChat />}
      />
      <Route
        path="/admin"
        element={
          <Suspense fallback={<div>Loading Admin...</div>}>
            <ContextProvider>
              <AppAdmin />
            </ContextProvider>
          </Suspense>
        }
      />
    </Routes>
  );
}

export default App;
