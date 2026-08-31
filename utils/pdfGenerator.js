import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

/**
 * Generate PDF receipt
 * @param {Object} res - Express response object
 * @param {Object} receiptData - Formatted receipt data
 * @param {Boolean} download - Whether to force download
 */
export const generateReceiptPDF = async (
  res,
  receiptData,
  download = false
) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });

      // Set response headers
      const filename = `receipt-${receiptData.receiptNumber}.pdf`;

      if (download) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
      } else {
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      }

      res.setHeader("Content-Type", "application/pdf");

      doc.pipe(res);

      // Add content to PDF
      addHeader(doc, receiptData);
      addCustomerInfo(doc, receiptData);
      addItemsTable(doc, receiptData);
      addTotals(doc, receiptData);
      addPaymentInfo(doc, receiptData);
      addFooter(doc, receiptData);

      doc.end();

      doc.on("end", () => resolve());
      doc.on("error", (error) => reject(error));
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Add header section to PDF
 */
const addHeader = (doc, data) => {
  // Company logo2/Header
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .fillColor("#2c5530")
    .text("YOUR STORE NAME", { align: "center" });

  doc.moveDown(0.5);
  doc
    .fontSize(16)
    .fillColor("#000000")
    .text("ORDER RECEIPT", { align: "center" });

  doc.moveDown();
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(`Receipt #: ${data.receiptNumber}`, { align: "left" })
    .text(`Order Date: ${new Date(data.date).toLocaleDateString()}`, {
      align: "left",
    });

  doc.moveDown();
  doc
    .moveTo(50, doc.y)
    .lineTo(550, doc.y)
    .strokeColor("#cccccc")
    .lineWidth(1)
    .stroke();

  doc.moveDown();
};

/**
 * Add customer information section
 */
const addCustomerInfo = (doc, data) => {
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("BILLING INFORMATION:", 50, doc.y);

  doc.moveDown(0.5);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`Name: ${data.customer.name}`)
    .text(`Email: ${data.customer.email}`);

  doc.moveDown();
};

/**
 * Add items table
 */
const addItemsTable = (doc, data) => {
  const tableTop = doc.y + 10;

  // Table header
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("ITEM", 50, tableTop)
    .text("QTY", 300, tableTop)
    .text("PRICE", 350, tableTop)
    .text("TOTAL", 450, tableTop);

  // Line under header
  doc
    .moveTo(50, tableTop + 15)
    .lineTo(550, tableTop + 15)
    .stroke();

  let yPosition = tableTop + 25;

  // Table rows
  data.items.forEach((item, index) => {
    if (yPosition > 700) {
      // Add new page if needed
      doc.addPage();
      yPosition = 50;
    }

    doc
      .font("Helvetica")
      .fontSize(9)
      .text(item.name, 50, yPosition, { width: 240 })
      .text(item.quantity.toString(), 300, yPosition)
      .text(`$${item.price}`, 350, yPosition)
      .text(`$${item.total}`, 450, yPosition);

    yPosition += 20;
  });

  doc.y = yPosition + 10;
};

/**
 * Add totals section
 */
const addTotals = (doc, data) => {
  const totalsTop = doc.y;

  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`Subtotal: $${data.pricing.subtotal.toFixed(2)}`, 400, totalsTop)
    .text(`Tax: $${data.pricing.tax.toFixed(2)}`, 400, totalsTop + 15)
    .text(
      `Shipping: $${data.pricing.shipping.toFixed(2)}`,
      400,
      totalsTop + 30
    );

  doc
    .moveTo(400, totalsTop + 45)
    .lineTo(500, totalsTop + 45)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .text(`TOTAL: $${data.pricing.total.toFixed(2)}`, 400, totalsTop + 55);
};

/**
 * Add payment information
 */
const addPaymentInfo = (doc, data) => {
  doc.moveDown(2);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`Payment Method: ${data.payment.method}`, 50, doc.y)
    .text(`Payment Status: ${data.payment.status}`, 50, doc.y + 15);

  if (data.payment.paidAt) {
    doc.text(
      `Paid On: ${new Date(data.payment.paidAt).toLocaleDateString()}`,
      50,
      doc.y + 30
    );
  }
};

/**
 * Add footer section
 */
const addFooter = (doc, data) => {
  doc.y = 700;
  doc
    .fontSize(8)
    .fillColor("#666666")
    .text(data.notes, { align: "center", width: 500 })
    .moveDown(0.5)
    .text("Thank you for your business!", { align: "center" });
};
