import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import { SubmitPage } from "./submit/SubmitPage";
import { StatusPage } from "./status/StatusPage";
import { PmDashboard } from "./pm/PmDashboard";
import { HomePage } from "./components/HomePage";
import { Login } from "./auth/Login";
import { Signup } from "./auth/Signup";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/submit/:token" element={<SubmitPage />} />
        <Route path="/task/:taskId" element={<StatusPage />} />
        <Route
          path="/pm"
          element={
            <RequireAuth>
              <PmDashboard />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
