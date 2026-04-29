"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFile = parseFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function parseFile(filePath, mimeType) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    if (ext === ".pdf" || mimeType === "application/pdf") {
        const pdfParse = (await Promise.resolve().then(() => __importStar(require("pdf-parse")))).default;
        const buffer = fs_1.default.readFileSync(filePath);
        const data = await pdfParse(buffer);
        return data.text;
    }
    if (ext === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const mammoth = await Promise.resolve().then(() => __importStar(require("mammoth")));
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    }
    if ([".txt", ".md", ".csv", ".json"].includes(ext)) {
        return fs_1.default.readFileSync(filePath, "utf-8");
    }
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
        return `[Image file: ${path_1.default.basename(filePath)}. Content not extractable as text — the image has been stored and can be referenced.]`;
    }
    return `[File: ${path_1.default.basename(filePath)}. Type not supported for text extraction.]`;
}
//# sourceMappingURL=parser.js.map