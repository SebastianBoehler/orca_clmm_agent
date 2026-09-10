import json
import matplotlib.pyplot as plt
import numpy as np

with open("points.json") as f:
    obj = json.load(f)

current_price = obj["currentPrice"]
data_sorted = sorted(obj["data"], key=lambda d: d["price"])

prices = [d["price"] for d in data_sorted]
liquidity = [d["liquidity"] for d in data_sorted]

# Find the index closest to current price for reference
current_idx = min(range(len(prices)), key=lambda i: abs(prices[i] - current_price))

# Create the figure
plt.figure(figsize=(12, 6))

# Plot the full liquidity curve from left to right
plt.step(prices, liquidity, where="post", color="blue", label="Cumulative Liquidity")

# Mark the current price with a vertical line
plt.axvline(current_price, color="red", linestyle="--", label=f"Current Price: {current_price:.6f}")

# Add annotations for better readability
plt.annotate(f'Liquidity at current price: {liquidity[current_idx]:,}', 
             xy=(current_price, liquidity[current_idx]),
             xytext=(10, 30), textcoords='offset points',
             arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=.2'))

# Improve the plot appearance
plt.xlabel("Price (TokenB per TokenA)")
plt.ylabel("Cumulative Liquidity")
plt.title("Liquidity Distribution Across Price Range")
plt.grid(True, alpha=0.3)
plt.legend()

# Add a second subplot to show liquidity concentration around current price
plt.figure(figsize=(12, 6))

# Calculate a reasonable price range around current price (e.g., ±20%)
price_range = 0.2  # 20%
min_price = current_price * (1 - price_range)
max_price = current_price * (1 + price_range)

# Filter data points within this range
in_range_indices = [i for i, p in enumerate(prices) if min_price <= p <= max_price]
range_prices = [prices[i] for i in in_range_indices]
range_liquidity = [liquidity[i] for i in in_range_indices]

# Plot the zoomed-in view
plt.step(range_prices, range_liquidity, where="post", color="green", label="Liquidity")
plt.axvline(current_price, color="red", linestyle="--", label=f"Current Price: {current_price:.6f}")

plt.xlabel("Price (TokenB per TokenA)")
plt.ylabel("Cumulative Liquidity")
plt.title("Liquidity Concentration Around Current Price (±20%)")
plt.grid(True, alpha=0.3)
plt.legend()

plt.tight_layout()
plt.show()
