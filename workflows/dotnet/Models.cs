using System.Text.Json.Serialization;

namespace DejaVu;

/// <summary>
/// Input model for order activities. Matches the JSON keys sent by the Python backend.
/// </summary>
public class OrderInput
{
    [JsonPropertyName("order_id")]
    public string OrderId { get; set; } = "";

    [JsonPropertyName("items")]
    public List<Dictionary<string, object?>> Items { get; set; } = new();

    [JsonPropertyName("total")]
    public double Total { get; set; }

    [JsonPropertyName("authorization_id")]
    public string? AuthorizationId { get; set; }

    [JsonPropertyName("success")]
    public bool? Success { get; set; }
}

/// <summary>
/// SSE event pushed to the backend for real-time UI updates.
/// </summary>
public class OrderEvent
{
    [JsonPropertyName("order_id")]
    public string OrderId { get; set; } = "";

    [JsonPropertyName("step")]
    public string Step { get; set; } = "";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("attempt")]
    public int Attempt { get; set; } = 1;

    [JsonPropertyName("max_attempts")]
    public int MaxAttempts { get; set; } = 1;

    [JsonPropertyName("error")]
    public string Error { get; set; } = "";

    [JsonPropertyName("detail")]
    public string Detail { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = "";

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "temporal";

    public static OrderEvent Create(string orderId, string step, string status)
    {
        return new OrderEvent
        {
            OrderId = orderId,
            Step = step,
            Status = status,
            Timestamp = DateTime.UtcNow.ToString("o"),
        };
    }
}
