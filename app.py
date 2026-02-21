from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DATA_FILE = os.path.join(os.path.dirname(__file__), 'transactions.txt')

# ---------- Helpers (mirror C logic) ----------

def load_transactions():
    transactions = []
    if not os.path.exists(DATA_FILE):
        return transactions
    with open(DATA_FILE, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) == 9:
                try:
                    t = {
                        'type':     parts[0],
                        'amount':   float(parts[1]),
                        'category': parts[2],
                        'day':      int(parts[3]),
                        'month':    int(parts[4]),
                        'year':     int(parts[5]),
                        'hour':     int(parts[6]),
                        'minute':   int(parts[7]),
                        'merchant': parts[8],
                    }
                    transactions.append(t)
                except ValueError:
                    continue
    return transactions


def save_transaction(t):
    with open(DATA_FILE, 'a') as f:
        f.write(
            f"{t['type']} {t['amount']:.2f} {t['category']} "
            f"{t['day']} {t['month']} {t['year']} "
            f"{t['hour']} {t['minute']} {t['merchant']}\n"
        )


def compute_balance(transactions):
    balance = 0.0
    for t in transactions:
        if t['type'] == 'income':
            balance += t['amount']
        elif t['type'] == 'expense':
            balance -= t['amount']
    return round(balance, 2)


# ---------- API Routes ----------

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/api/balance', methods=['GET'])
def get_balance():
    txns = load_transactions()
    balance = compute_balance(txns)
    total_income  = sum(t['amount'] for t in txns if t['type'] == 'income')
    total_expense = sum(t['amount'] for t in txns if t['type'] == 'expense')
    return jsonify({
        'balance':       balance,
        'total_income':  round(total_income, 2),
        'total_expense': round(total_expense, 2),
        'tx_count':      len(txns),
    })


@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    txns = load_transactions()
    return jsonify(txns[::-1])   # newest first


@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    data = request.get_json()
    tx_type  = data.get('type', '').lower()
    amount   = float(data.get('amount', 0))
    category = data.get('category', 'General').replace(' ', '_')
    day      = int(data.get('day', 1))
    month    = int(data.get('month', 1))
    year     = int(data.get('year', 2024))
    hour     = int(data.get('hour', 0))
    minute   = int(data.get('minute', 0))
    merchant = data.get('merchant', 'Unknown').replace(' ', '_')

    if tx_type not in ('income', 'expense'):
        return jsonify({'error': 'Type must be income or expense'}), 400
    if amount <= 0:
        return jsonify({'error': 'Amount must be positive'}), 400

    # Mirror C: insufficient balance check
    if tx_type == 'expense':
        txns = load_transactions()
        balance = compute_balance(txns)
        if amount > balance:
            return jsonify({'error': 'Insufficient balance for this expense'}), 400

    t = {
        'type': tx_type, 'amount': amount, 'category': category,
        'day': day, 'month': month, 'year': year,
        'hour': hour, 'minute': minute, 'merchant': merchant,
    }
    save_transaction(t)
    return jsonify({'message': 'Transaction added successfully', 'transaction': t}), 201


@app.route('/api/report', methods=['GET'])
def get_report():
    month = int(request.args.get('month', 0))
    year  = int(request.args.get('year', 0))

    txns = load_transactions()
    filtered = [t for t in txns if t['month'] == month and t['year'] == year]

    total_income  = sum(t['amount'] for t in filtered if t['type'] == 'income')
    total_expense = sum(t['amount'] for t in filtered if t['type'] == 'expense')
    savings       = total_income - total_expense
    alert         = total_expense > 0.75 * total_income if total_income > 0 else False

    # Category breakdown for chart
    cat_breakdown = {}
    for t in filtered:
        if t['type'] == 'expense':
            cat_breakdown[t['category']] = cat_breakdown.get(t['category'], 0) + t['amount']

    return jsonify({
        'month':           month,
        'year':            year,
        'transactions':    filtered,
        'total_income':    round(total_income, 2),
        'total_expense':   round(total_expense, 2),
        'savings':         round(savings, 2),
        'alert':           alert,
        'cat_breakdown':   {k: round(v, 2) for k, v in cat_breakdown.items()},
    })


@app.route('/api/clear', methods=['DELETE'])
def clear_transactions():
    open(DATA_FILE, 'w').close()
    return jsonify({'message': 'All transactions cleared'})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
