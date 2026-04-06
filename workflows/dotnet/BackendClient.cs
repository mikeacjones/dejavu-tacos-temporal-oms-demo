using System.Text.Json;

namespace DejaVu;

/// <summary>
/// HTTP client for communicating with the FastAPI backend's internal API.
/// Handles SSE event push, failure state checks, and store order registration.
/// </summary>
public class BackendClient
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;

    public BackendClient(string baseUrl)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    }

    /// <summary>
    /// Checks whether a step should fail based on the backend's current failure scenario.
    /// </summary>
    public async Task<bool> ShouldFailAsync(string step)
    {
        try
        {
            var resp = await _http.GetAsync($"{_baseUrl}/api/internal/should-fail/{step}");
            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("should_fail", out var val) && val.GetBoolean();
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Pushes an SSE event to the backend for real-time UI updates.
    /// </summary>
    public async Task EmitEventAsync(OrderEvent evt)
    {
        try
        {
            var json = JsonSerializer.Serialize(evt);
            var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            await _http.PostAsync($"{_baseUrl}/api/internal/events", content);
        }
        catch
        {
            // Best effort — don't fail the activity over an SSE event
        }
    }

    /// <summary>
    /// Registers an order on the kitchen display system.
    /// </summary>
    public async Task RegisterStoreOrderAsync(string orderId, Dictionary<string, object?> data)
    {
        try
        {
            var json = JsonSerializer.Serialize(data);
            var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            await _http.PostAsync($"{_baseUrl}/api/internal/store-orders/{orderId}", content);
        }
        catch
        {
            // Best effort
        }
    }
}
