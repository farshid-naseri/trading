import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, method = 'GET', headers = {}, data, params } = body;

    console.log(`🔍 Proxy Debug - Request: ${method} ${url}`);
    console.log(`🔍 Proxy Debug - Headers:`, Object.keys(headers));
    console.log(`🔍 Proxy Debug - Data length:`, data ? data.length : 0);
    console.log(`🔍 Proxy Debug - Params:`, params);

    // ساخت هدرهای جدید برای ارسال به CoinEx
    const proxyHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...headers
    };

    // حذف هدرهایی که ممکن است باعث مشکل شوند
    delete proxyHeaders['host'];
    delete proxyHeaders['origin'];
    delete proxyHeaders['referer'];

    // ساخت URL نهایی با پارامترها
    let finalUrl = url;
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryString;
    }

    let response;
    
    try {
      if (method === 'GET') {
        console.log(`🔍 Proxy Debug - Making GET request to: ${finalUrl}`);
        response = await fetch(finalUrl, {
          method: 'GET',
          headers: proxyHeaders
        });
      } else {
        // برای درخواست‌های POST، body باید دقیقاً همان چیزی باشد که از کلاینت آمده است
        // بدون هیچ تغییری، زیرا امضا بر اساس همین محتوا تولید شده است
        console.log(`🔍 Proxy Debug - Making ${method} request to: ${finalUrl}`);
        console.log(`🔍 Proxy Debug - Request body:`, data);
        response = await fetch(finalUrl, {
          method: method,
          headers: proxyHeaders,
          body: data // data از قبل رشته‌ای است و نیازی به JSON.stringify ندارد
        });
      }

      console.log(`🔍 Proxy Debug - Response status: ${response.status}`);
      console.log(`🔍 Proxy Debug - Response headers:`, Object.fromEntries(response.headers.entries()));

      const responseData = await response.text();
      console.log(`🔍 Proxy Debug - Response length: ${responseData.length}`);
      
      // برگرداندن پاسخ با همان وضعیت و هدرها
      return new NextResponse(responseData, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
        }
      });
    } catch (fetchError) {
      console.error('🔍 Proxy Debug - Fetch error:', fetchError);
      throw new Error(`Fetch failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown fetch error'}`);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Proxy error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}