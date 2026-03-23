import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComparePage from "@/app/compare/page";
import { fetchStockData, searchTickers } from "@/lib/api";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockUseAuth = jest.fn();

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/components/ui/Navbar", () => ({
  __esModule: true,
  default: () => <div data-testid="navbar" />,
}));

jest.mock("@/components/chart/CompareChart", () => ({
  __esModule: true,
  STOCK_COLORS: ["#1", "#2", "#3", "#4", "#5"],
  default: ({ stocks, visibleEventTickers }: { stocks: Array<{ ticker: string }>; visibleEventTickers: Set<string> }) => (
    <div data-testid="compare-chart">
      {stocks.map((s) => `${s.ticker}:${visibleEventTickers.has(s.ticker) ? "on" : "off"}`).join(",")}
    </div>
  ),
}));

jest.mock("@/lib/api", () => ({
  fetchStockData: jest.fn(),
  searchTickers: jest.fn(),
}));

const stockData = {
  ticker: "AAPL",
  companyName: "Apple",
  bars: [
    { time: "2026-01-01", open: 100, high: 110, low: 99, close: 100, volume: 10 },
    { time: "2026-03-01", open: 100, high: 120, low: 95, close: 110, volume: 12 },
  ],
  events: [
    { id: "e1", time: "2026-03-01", title: "Launch event", summary: "", sentiment: "positive", source: "Reuters" as const },
  ],
};

describe("ComparePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("shows guest sidebar CTA", () => {
    mockUseAuth.mockReturnValue({ user: null });
    render(<ComparePage />);

    expect(screen.getByText(/search and add stocks above to compare/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("adds a ticker, renders chart, and toggles events for signed-in users", async () => {
    mockUseAuth.mockReturnValue({ user: { email: "user@example.com" } });
    (searchTickers as jest.Mock).mockResolvedValue([{ ticker: "AAPL", companyName: "Apple" }]);
    (fetchStockData as jest.Mock).mockResolvedValue(stockData);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<ComparePage />);

    await user.type(screen.getByPlaceholderText(/add ticker/i), "aa");
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await user.click(await screen.findByRole("button", { name: /aapl apple/i }));

    await waitFor(() => {
      expect(screen.getByTestId("compare-chart")).toHaveTextContent("AAPL:on");
    });
    expect(screen.getByText("Launch event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1y/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /aapl.*1 events.*on/i }));
    await waitFor(() => {
      expect(screen.getByTestId("compare-chart")).toHaveTextContent("AAPL:off");
    });

    await user.click(screen.getByRole("button", { name: /remove aapl/i }));
    expect(screen.getByText(/search and add stocks above to compare/i)).toBeInTheDocument();
  });

  it("drops ticker if fetch fails", async () => {
    mockUseAuth.mockReturnValue({ user: { email: "user@example.com" } });
    (searchTickers as jest.Mock).mockResolvedValue([{ ticker: "AAPL", companyName: "Apple" }]);
    (fetchStockData as jest.Mock).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<ComparePage />);

    await user.type(screen.getByPlaceholderText(/add ticker/i), "aa");
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    await user.click(await screen.findByRole("button", { name: /aapl apple/i }));

    await waitFor(() => {
      expect(screen.queryByText("AAPL")).not.toBeInTheDocument();
    });
  });
});
