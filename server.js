import express from 'express';
import multer from 'multer';
import { run } from 'node-jq';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure multer to handle JSON files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        // Keep the .json extension
        cb(null, file.fieldname + '-' + Date.now() + '.json')
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Accept only .json files
        if (path.extname(file.originalname) !== '.json') {
            return cb(new Error('Only .json files are allowed!'));
        }
        cb(null, true);
    }
});

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Default jq queries
const PRESET_QUERIES = {
    'Context Count': 'group_by(.fields.context) | map({context: .[0].fields.context, count: length}) | sort_by(.count) | reverse',
    'Simple Context Count': 'group_by(.fields.context) | map({(.[0].fields.context): length}) | add',
    'Error Levels': 'group_by(.fields.level) | map({level: .[0].fields.level, count: length})',
    'Recent Errors': '[.[] | select(.fields.level == "error")] | sort_by(.fields.timestamp) | reverse | .[0:5]'
};

app.get('/', (req, res) => {
    res.render('index', { result: null, error: null, queries: PRESET_QUERIES });
});

app.post('/analyze', upload.single('jsonFile'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('Please upload a file');
        }

        const query = req.body.query || PRESET_QUERIES['Context Count'];
        const result = await run(query, req.file.path, { input: 'file', output: 'json' });

        // Clean up: Delete the uploaded file after processing
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting file:', err);
        });

        res.render('index', { 
            result: JSON.stringify(result, null, 2), 
            error: null,
            queries: PRESET_QUERIES
        });
    } catch (error) {
        // Clean up in case of error
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }

        res.render('index', { 
            result: null, 
            error: error.message,
            queries: PRESET_QUERIES
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});