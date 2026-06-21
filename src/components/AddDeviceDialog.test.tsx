// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { setWriteKey } from "../lib/auth";

const toCanvas = vi.fn().mockResolvedValue(undefined);
vi.mock("qrcode", () => ({
  default: { toCanvas: (...args: unknown[]) => toCanvas(...args) },
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  toCanvas.mockClear();
  window.history.replaceState(null, "", "/boards/abc");
});

describe("AddDeviceDialog", () => {
  it("renders nothing when closed", () => {
    render(<AddDeviceDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByText("デバイスを追加")).toBeNull();
  });

  it("shows a link containing the write key in the fragment", async () => {
    setWriteKey("transfer-me");
    render(<AddDeviceDialog open={true} onClose={vi.fn()} />);
    const input = (await screen.findByDisplayValue(/#wk=transfer-me/)) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it("renders the QR code onto the canvas", async () => {
    setWriteKey("transfer-me");
    render(<AddDeviceDialog open={true} onClose={vi.fn()} />);
    await waitFor(() => expect(toCanvas).toHaveBeenCalledOnce());
    expect(toCanvas.mock.calls[0][1]).toContain("#wk=transfer-me");
  });

  it("copies the link and shows confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setWriteKey("transfer-me");
    render(<AddDeviceDialog open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("リンクをコピー"));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(await screen.findByText("コピーしました")).toBeTruthy();
  });

  it("calls onClose when 閉じる is clicked", () => {
    const onClose = vi.fn();
    render(<AddDeviceDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
