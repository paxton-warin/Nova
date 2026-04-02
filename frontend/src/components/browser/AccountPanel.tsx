import React, { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Shield, Ticket, User, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BrowserUser } from "@/types/browser";

interface AccountPanelProps {
  user: BrowserUser | null;
  authError: string | null;
  syncPromptOpen: boolean;
  onClearAuthError: () => void;
  onLogin: (username: string, password: string, totpToken?: string) => Promise<boolean>;
  onRegister: (username: string, password: string) => Promise<boolean>;
  onLogout: () => Promise<void>;
  onStartTotpSetup: () => Promise<{
    base32: string;
    qrCodeDataUrl: string;
    otpauthUrl: string;
  }>;
  onVerifyTotp: (token: string) => Promise<void>;
  onDisableTotp: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onOpenTickets: () => void;
  onOpenAdmin: () => void;
  onOpenBrowserSettings?: () => void;
  onBack?: () => void;
  onClose: () => void;
}

export const AccountPanel: React.FC<AccountPanelProps> = ({
  user,
  authError,
  syncPromptOpen,
  onClearAuthError,
  onLogin,
  onRegister,
  onLogout,
  onStartTotpSetup,
  onVerifyTotp,
  onDisableTotp,
  onChangePassword,
  onOpenTickets,
  onOpenAdmin,
  onOpenBrowserSettings,
  onBack,
  onClose,
}) => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [totpSetup, setTotpSetup] = useState<{
    base32: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [passwordVisibility, setPasswordVisibility] = useState({
    login: false,
    current: false,
    next: false,
  });
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [confirmDisableTotpOpen, setConfirmDisableTotpOpen] = useState(false);

  async function handleAuthSubmit(event: React.FormEvent) {
    event.preventDefault();
    onClearAuthError();
    setAccountError(null);
    setBusyAction(mode === "login" ? "signin" : "signup");
    try {
      const ok =
        mode === "login"
          ? await onLogin(username, password, totpToken || undefined)
          : await onRegister(username, password);
      if (ok) {
        setUsername("");
        setPassword("");
        setTotpToken("");
        setAccountMessage(mode === "login" ? "Signed in." : "Account created.");
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setAccountError(null);
    try {
      setBusyAction("password");
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setAccountMessage("Password updated.");
      return true;
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Unable to update password.",
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartTotpSetup() {
    setAccountError(null);
    try {
      setBusyAction("totp-start");
      const payload = await onStartTotpSetup();
      setTotpSetup({
        base32: payload.base32,
        qrCodeDataUrl: payload.qrCodeDataUrl,
      });
      setAccountMessage("Scan the QR code, then verify the 6-digit code.");
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Unable to start TOTP setup.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerifyTotp() {
    setAccountError(null);
    try {
      setBusyAction("totp-verify");
      await onVerifyTotp(totpToken);
      setTotpSetup(null);
      setTotpToken("");
      setAccountMessage("TOTP verified and enabled.");
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Unable to verify that TOTP code.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function copyTotpSecret() {
    if (!totpSetup?.base32) return;
    try {
      await navigator.clipboard.writeText(totpSetup.base32);
      setAccountMessage("TOTP secret copied.");
    } catch {
      setAccountError("Unable to copy the TOTP secret.");
    }
  }

  return (
    <div className="w-[26rem] border-l border-border bg-card flex flex-col h-full animate-panel-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              onClick={onBack}
              className="p-1 rounded hover:bg-chrome-hover transition-colors"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : null}
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4" />
            Account
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-chrome-hover transition-colors"
          title="Close account"
          aria-label="Close account"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {authError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {authError}
          </div>
        )}
        {accountError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {accountError}
          </div>
        )}
        {accountMessage && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
            {accountMessage}
          </div>
        )}
        {syncPromptOpen && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="text-sm font-semibold">Sync is ready</div>
          </div>
        )}

        {!user ? (
          <section className="rounded-xl border border-border p-4 space-y-4">
            <div className="flex gap-1 bg-secondary rounded-lg p-1">
              {(["login", "signup"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-medium ${mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {value === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
            <form className="space-y-3" onSubmit={handleAuthSubmit}>
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
              />
              <Input
                type={passwordVisibility.login ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              <button
                type="button"
                onClick={() =>
                  setPasswordVisibility((current) => ({
                    ...current,
                    login: !current.login,
                  }))
                }
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {passwordVisibility.login ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {passwordVisibility.login ? "Hide password" : "Show password"}
              </button>
              {mode === "login" && (
                <Input
                  value={totpToken}
                  onChange={(event) => setTotpToken(event.target.value)}
                  placeholder="TOTP token (if required)"
                />
              )}
              <Button className="w-full" type="submit" disabled={busyAction !== null}>
                {busyAction === "signin"
                  ? "Signing In..."
                  : busyAction === "signup"
                    ? "Creating Account..."
                    : mode === "login"
                      ? "Sign In"
                      : "Create Account"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">Usernames only. Admins require TOTP.</p>
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{user.username}</div>
                  <div className="text-xs text-muted-foreground">
                    Role: {user.role} • TOTP {user.totpEnabled ? "enabled" : "disabled"}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => setConfirmLogoutOpen(true)}>
                  Log Out
                </Button>
              </div>
              {user.isAdmin && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="secondary" className="w-full" onClick={onOpenTickets}>
                    <Ticket className="mr-2 h-4 w-4" />
                    Open Tickets
                  </Button>
                  <Button variant="secondary" className="w-full" onClick={onOpenAdmin}>
                    Open Admin Panel
                  </Button>
                </div>
              )}
              {!user.isAdmin ? (
                <Button variant="secondary" className="w-full" onClick={onOpenTickets}>
                  <Ticket className="mr-2 h-4 w-4" />
                  Open Tickets
                </Button>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-secondary/40 px-3 py-3 text-center">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Role
                  </div>
                  <div className="mt-1 text-sm font-medium">{user.role}</div>
                </div>
                <div className="rounded-xl border border-border bg-secondary/40 px-3 py-3 text-center">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    TOTP
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {user.totpEnabled ? "Protected" : "Off"}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                Change Password
              </div>
              <Button className="w-full" type="button" onClick={() => setChangePasswordDialogOpen(true)}>
                Change Password
              </Button>
            </section>

            <section className="rounded-xl border border-border p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                TOTP Security
              </div>
              {!user.totpEnabled ? (
                <>
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={busyAction !== null}
                    onClick={() => void handleStartTotpSetup()}
                  >
                    {busyAction === "totp-start" ? "Preparing TOTP..." : "Start TOTP Setup"}
                  </Button>
                  {totpSetup && (
                    <div className="space-y-3">
                      <img
                        src={totpSetup.qrCodeDataUrl}
                        alt="TOTP QR code"
                        className="w-40 h-40 rounded-lg border border-border bg-white p-2"
                      />
                      <div className="rounded-xl border border-border bg-secondary/30 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Secret</div>
                        <div className="mt-1 break-all text-xs text-foreground">{totpSetup.base32}</div>
                        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => void copyTotpSecret()}>
                          Copy Secret
                        </Button>
                      </div>
                      <Input
                        value={totpToken}
                        onChange={(event) => setTotpToken(event.target.value)}
                        placeholder="Enter code to verify"
                        inputMode="numeric"
                      />
                      <Button
                        className="w-full"
                        disabled={busyAction !== null}
                        onClick={() => void handleVerifyTotp()}
                      >
                        {busyAction === "totp-verify" ? "Verifying..." : "Verify TOTP"}
                      </Button>
                    </div>
                  )}
                </>
              ) : user.isAdmin ? (
                <div className="space-y-3">
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={busyAction !== null}
                    onClick={() => void handleStartTotpSetup()}
                  >
                    {busyAction === "totp-start" ? "Preparing New Secret..." : "Roll New TOTP Secret"}
                  </Button>
                  {totpSetup && (
                    <div className="space-y-3">
                      <img
                        src={totpSetup.qrCodeDataUrl}
                        alt="TOTP QR code"
                        className="w-40 h-40 rounded-lg border border-border bg-white p-2"
                      />
                      <div className="rounded-xl border border-border bg-secondary/30 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Secret</div>
                        <div className="mt-1 break-all text-xs text-foreground">{totpSetup.base32}</div>
                        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => void copyTotpSecret()}>
                          Copy Secret
                        </Button>
                      </div>
                      <Input
                        value={totpToken}
                        onChange={(event) => setTotpToken(event.target.value)}
                        placeholder="Enter code from new secret"
                        inputMode="numeric"
                      />
                      <Button
                        className="w-full"
                        disabled={busyAction !== null}
                        onClick={() => void handleVerifyTotp()}
                      >
                        {busyAction === "totp-verify" ? "Verifying..." : "Verify New Secret"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Button variant="secondary" className="w-full" onClick={() => setConfirmDisableTotpOpen(true)}>
                  Disable TOTP
                </Button>
              )}
            </section>
          </>
        )}
      </div>

      {onOpenBrowserSettings ? (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="outline"
            className="w-full text-xs"
            onClick={() => {
              onOpenBrowserSettings();
            }}
          >
            Browser settings
          </Button>
        </div>
      ) : null}

      <Dialog open={changePasswordDialogOpen} onOpenChange={setChangePasswordDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Update your password.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              void handleChangePassword(event).then((ok) => {
                if (ok) setChangePasswordDialogOpen(false);
              });
            }}
          >
            <Input
              type={passwordVisibility.current ? "text" : "password"}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
            />
            <Input
              type={passwordVisibility.next ? "text" : "password"}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
            />
            <div className="flex gap-3 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() =>
                  setPasswordVisibility((current) => ({
                    ...current,
                    current: !current.current,
                  }))
                }
                className="flex items-center gap-1.5"
              >
                {passwordVisibility.current ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {passwordVisibility.current ? "Hide current" : "Show current"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setPasswordVisibility((current) => ({
                    ...current,
                    next: !current.next,
                  }))
                }
                className="flex items-center gap-1.5"
              >
                {passwordVisibility.next ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {passwordVisibility.next ? "Hide new" : "Show new"}
              </button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setChangePasswordDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busyAction !== null}>
                {busyAction === "password" ? "Updating Password..." : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmLogoutOpen} onOpenChange={setConfirmLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>You will need to sign in again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onLogout()}>Log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisableTotpOpen} onOpenChange={setConfirmDisableTotpOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable TOTP?</AlertDialogTitle>
            <AlertDialogDescription>This removes TOTP protection from your account.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onDisableTotp()}>
              Disable TOTP
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};
