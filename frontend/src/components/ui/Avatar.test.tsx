// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import Avatar from "./Avatar";

describe("Avatar", () => {
  it("renders normal avatar image correctly", () => {
    render(
      <Avatar
        src="./avatar.png"
        alt="User avatar"
        size="xl"
        className="animate-spin"
      />,
    );

    const avatar = screen.getByRole("img", { name: "User avatar" });

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute("src", "./avatar.png");
    expect(avatar).toHaveClass("w-12 h-12 text-[13px]");
    expect(avatar).toHaveClass("animate-spin");
  });

  it("renders backup avatar initials correctly", () => {
    render(<Avatar alt="nova" className="animate-spin" />);

    const avatar = screen.getByText("N");

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveClass("w-8 h-8 text-[10px]");
    expect(avatar).toHaveClass("animate-spin");
  });

  it("renders backups correctly", () => {
    render(<Avatar />);

    const avatar = screen.getByText("U");

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveClass("w-8 h-8 text-[10px]");
    expect(avatar).toHaveClass(
      "rounded-full",
      "bg-gradient-to-br",
      "from-primary",
      "via-accent",
      "to-secondary",
      "flex",
      "items-center",
      "justify-center",
      "text-white",
      "font-bold",
      "shrink-0",
    );
  });
});
