import axios from "axios";

const API_URL = "http://localhost:8210/v1";
const API_KEY = "test_key_sportoonline"; // From seed data

async function testPhase4() {
  try {
    console.log("1. Creating invoice...");
    const createRes = await axios.post(`${API_URL}/invoices`, {
      buyer: {
        tcknVkn: "12345678901",
        name: "Test Customer",
        address: "Test Address",
        city: "Istanbul",
        country: "Türkiye"
      },
      items: [
        {
          name: "Test Product",
          quantity: 1,
          unitPrice: 100,
          vatRate: 20
        }
      ],
      currency: "TRY"
    }, {
      headers: { "X-Api-Key": API_KEY, "Idempotency-Key": `test-p4-${Date.now()}` }
    });

    const invoiceId = createRes.data.invoice_id;
    console.log(`Invoice created: ${invoiceId}`);

    // Wait a bit for worker to process
    console.log("Waiting for worker...");
    await new Promise(r => setTimeout(r, 2000));

    console.log("2. Fetching invoice status...");
    const statusRes = await axios.get(`${API_URL}/invoices/${invoiceId}`, {
      headers: { "X-Api-Key": API_KEY }
    });
    console.log("Current status:", statusRes.data.status);

    console.log("3. Fetching PDF...");
    try {
        const pdfRes = await axios.get(`${API_URL}/invoices/${invoiceId}/pdf`, {
            headers: { "X-Api-Key": API_KEY },
            maxRedirects: 0,
            validateStatus: (s) => s === 302 || s === 200
        });
        console.log("PDF Result:", pdfRes.status === 302 ? `Redirect to ${pdfRes.headers.location}` : "Binary content");
    } catch (e) {
        console.error("PDF Fetch failed:", e.message);
    }

    console.log("4. Cancelling invoice...");
    const cancelRes = await axios.post(`${API_URL}/invoices/${invoiceId}/cancel`, {
      reason: "Test cancellation"
    }, {
      headers: { "X-Api-Key": API_KEY }
    });
    console.log("Cancel requested:", cancelRes.data.status);

    // Wait for cancel worker
    console.log("Waiting for cancel worker...");
    await new Promise(r => setTimeout(r, 2000));

    console.log("5. Final status check...");
    const finalRes = await axios.get(`${API_URL}/invoices/${invoiceId}`, {
      headers: { "X-Api-Key": API_KEY }
    });
    console.log("Final status:", finalRes.data.status);

  } catch (error) {
    console.error("Test failed:", error.response?.data || error.message);
  }
}

testPhase4();
