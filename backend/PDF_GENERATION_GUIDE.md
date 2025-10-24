# PDF Generation System with Playwright

## 🎯 Overview

We've successfully migrated from `@react-pdf/renderer` to **Playwright + HTML/CSS** for PDF generation. This provides better control over styling, more flexibility, and exact visual matching with web previews.

## 🏗️ Architecture

### Core Components

1. **`PlaywrightPdfGenerator`** - Main PDF generation service using Playwright
2. **`TemplateService`** - Handlebars template rendering service
3. **`PdfGeneratorService`** - Updated main service orchestrating the process
4. **HTML Templates** - Located in `templates/html/`

### File Structure

```
backend/src/modules/receipts/
├── templates/
│   ├── html/
│   │   ├── standard-receipt.html    # Standard receipt template
│   │   └── compact-receipt.html     # Compact receipt template
│   └── index.ts                     # React templates (legacy)
├── services/
│   ├── pdf-generator.service.tsx    # Main orchestrator
│   ├── template.service.ts          # Handlebars template service
│   └── playwright-pdf-generator.service.ts # Playwright PDF generator
└── controllers/
    └── pdf-test.controller.ts       # Test endpoint
```

## 🚀 Features

### ✅ Implemented

- **HTML/CSS Templates** - Clean, maintainable templates
- **Handlebars Templating** - Dynamic content rendering
- **Playwright PDF Generation** - High-quality PDF output
- **Logo Support** - Base64 embedded logos from Object Storage
- **Multiple Styles** - Standard and Compact receipt styles
- **Font Support** - NotoSans fonts embedded
- **Error Handling** - Comprehensive error management
- **Docker Support** - Ready for containerized deployment

### 🎨 Template Features

- **Responsive Design** - Optimized for A4 format
- **Print Styles** - `@page` CSS rules for proper margins
- **Background Support** - Colors and images included
- **Typography** - Professional font rendering
- **Conditional Content** - Dynamic sections based on data

## 📋 Usage

### Basic PDF Generation

```typescript
// Generate standard receipt
const result = await pdfGeneratorService.generateReceiptPdf(
  order,
  receiptNumber,
  companyName,
  userId,
  ReceiptStyle.STANDARD
);

// Generate compact receipt
const result = await pdfGeneratorService.generateReceiptPdf(
  order,
  receiptNumber,
  companyName,
  userId,
  ReceiptStyle.COMPACT
);
```

### Template Data Structure

```typescript
interface TemplateData {
  companyName: string;
  hasCustomLogo: boolean;
  logoPath?: string;
  receiptNumber: string;
  orderDate: string;
  generatedAt: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  items: Array<{
    productName: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  subtotal: string;
  total: string;
}
```

## 🧪 Testing

### Test Endpoint

Use the test endpoint to verify PDF generation:

```bash
POST /pdf-test/generate-test-pdf
```

This generates a sample PDF with test data.

### Manual Testing

1. Start the backend server
2. Make a POST request to `/pdf-test/generate-test-pdf`
3. Download and verify the generated PDF

## 🐳 Docker Deployment

### Using Playwright Docker Image

```dockerfile
# Use Playwright's official image
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

### Build Command

```bash
docker build -f Dockerfile.playwright -t receiptmaster-backend .
```

## 🔧 Configuration

### Environment Variables

- `S3_ENDPOINT` - Object Storage endpoint
- `AWS_REGION` - AWS region
- `AWS_ACCESS_KEY_ID` - Access key
- `AWS_SECRET_ACCESS_KEY` - Secret key
- `LOGOS_BUCKET` - Bucket for logos
- `RECEIPTS_BUCKET` - Bucket for PDFs

### PDF Options

```typescript
interface PdfOptions {
  format?: 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'Letter' | 'Legal' | 'Tabloid';
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  printBackground?: boolean;
  preferCSSPageSize?: boolean;
  displayHeaderFooter?: boolean;
}
```

## 🎨 Customization

### Adding New Templates

1. Create HTML template in `templates/html/`
2. Add template enum to `ReceiptTemplate`
3. Update `TemplateService` to load new template
4. Add new style to `ReceiptStyle` enum

### Template Syntax

```html
<!-- Basic variables -->
<h1>{{companyName}}</h1>
<p>Receipt #{{receiptNumber}}</p>

<!-- Conditional content -->
{{#if hasCustomLogo}}
<img src="{{logoPath}}" alt="Logo">
{{/if}}

<!-- Loops -->
{{#each items}}
<tr>
  <td>{{productName}}</td>
  <td>{{qty}}</td>
  <td>{{unitPrice}}</td>
  <td>{{lineTotal}}</td>
</tr>
{{/each}}
```

## 🚀 Performance

### Optimizations

- **Template Caching** - Templates are compiled once and cached
- **Browser Reuse** - Single browser instance for multiple PDFs
- **Memory Management** - Proper cleanup of pages and resources
- **Error Recovery** - Graceful handling of failures

### Monitoring

- Comprehensive logging for debugging
- PDF validation before storage
- Error tracking and reporting

## 🔄 Migration Notes

### From @react-pdf/renderer

- **Templates**: Moved from React components to HTML/CSS
- **Styling**: Now uses standard CSS instead of React-PDF styles
- **Data**: Handlebars templating instead of React props
- **Performance**: Better rendering quality and consistency

### Backward Compatibility

- Same API interface maintained
- Same `ReceiptStyle` enum values
- Same return format `{ filePath, url }`

## 🛠️ Troubleshooting

### Common Issues

1. **Browser Launch Failures**
   - Ensure Playwright browsers are installed
   - Check Docker permissions for browser access

2. **Template Rendering Errors**
   - Verify Handlebars syntax
   - Check template data structure

3. **PDF Generation Failures**
   - Check HTML validity
   - Verify CSS print styles

### Debug Mode

Enable detailed logging by setting log level to `debug` in your environment.

## 📈 Future Enhancements

- [ ] Template preview endpoint
- [ ] Batch PDF generation
- [ ] Watermark support
- [ ] Multi-language templates
- [ ] Custom font uploads
- [ ] Template editor UI
