import sys
import json
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller
import warnings
warnings.filterwarnings('ignore')

print("Step 0: Script started")

def calculate_mape(y_true, y_pred):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    mask = y_true != 0
    if mask.sum() == 0:
        return 0
    return np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100

def detect_seasonality(series):
    if len(series) < 4:
        return 'None'
    result = adfuller(series)
    is_stationary = result[1] < 0.05
    return 'None' if is_stationary else 'Potential seasonality'

def create_features(df, date_index=None):
    df = df.copy()
    if date_index is not None:
        df.index = date_index
    df['month'] = df.index.month
    df['quarter'] = df.index.quarter
    df['lag_1'] = df['totalAmount'].shift(1)
    df['lag_2'] = df['totalAmount'].shift(2)
    df['rolling_mean_3'] = df['totalAmount'].rolling(window=3).mean()
    df['rolling_std_3'] = df['totalAmount'].rolling(window=3).std()
    df['promotion'] = df['promotion'].astype(int)
    return df

def main():
    print("Step 1: Parsing input")
    try:
        sales_data = json.loads(sys.argv[1])
        forecast_period = sys.argv[2]
        model_type = sys.argv[3]
        start_date = pd.to_datetime(sys.argv[4])
        end_date = pd.to_datetime(sys.argv[5])
    except Exception as e:
        print(json.dumps({"error": f"Failed to parse arguments: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    print("Step 2: Creating DataFrame")
    try:
        df = pd.DataFrame(sales_data)
        if df.empty or 'date' not in df or 'totalAmount' not in df:
            raise ValueError("Invalid sales data: missing date or totalAmount")
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        df['totalAmount'] = df['totalAmount'].astype(float)
        if df['totalAmount'].isnull().any() or (df['totalAmount'] <= 0).all():
            raise ValueError("Invalid totalAmount: contains null or all zeros")
        df['promotion'] = df.get('promotion', False).astype(bool)
    except Exception as e:
        print(json.dumps({"error": f"Data preparation error: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    print("Step 3: Aggregate by period")
    freq_map = {'Daily': 'D', 'Weekly': 'W', 'Monthly': 'M'}
    freq = freq_map.get(forecast_period, 'M')
    try:
        sales_series = df.groupby(df['date'].dt.to_period(freq))['totalAmount'].sum()
        sales_series = sales_series.to_timestamp()
        if sales_series.empty:
            raise ValueError("No data after aggregation")
        if (sales_series == 0).all():
            raise ValueError("Aggregated series contains only zeros")
        sales_df = pd.DataFrame({'totalAmount': sales_series}, index=sales_series.index)
        sales_df['promotion'] = df.groupby(df['date'].dt.to_period(freq))['promotion'].any().to_timestamp()
    except Exception as e:
        print(json.dumps({"error": f"Resampling error: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    print("Step 4: Extract features")
    try:
        seasonality = detect_seasonality(sales_series)
        sales_df = create_features(sales_df)
        features = {
            'seasonality': seasonality,
            'promotion': bool(sales_df['promotion'].any()),
            'laggedSales': float(sales_df['lag_1'].iloc[-1]) if len(sales_df) > 1 else 0,
            'economicTrend': 'Stable'
        }
    except Exception as e:
        print(json.dumps({"error": f"Feature extraction error: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    print("Step 5: Train model and forecast")
    try:
        if len(sales_df) < 2:
            raise ValueError("At least 2 data points required for forecasting")
        train = sales_df.iloc[:-1] if len(sales_df) > 2 else sales_df
        test = sales_df.iloc[-1:] if len(sales_df) > 2 else pd.DataFrame([])

        # Generate future dates
        date_range = pd.date_range(start=start_date, end=end_date, freq=freq)
        if len(date_range) == 0:
            raise ValueError("Invalid date range: endDate must be after startDate")

        predictions = []
        
        if model_type == 'ARIMA':
            if len(train) < 3:
                raise ValueError("ARIMA requires at least 3 data points")
            try:
                from pmdarima import auto_arima
                model = auto_arima(
                    train['totalAmount'],
                    seasonal=False,
                    max_p=2,
                    max_q=2,
                    d=1,
                    trace=False,
                    suppress_warnings=True
                )
                fitted = ARIMA(train['totalAmount'], order=model.order).fit()
                forecast = fitted.forecast(steps=len(date_range))
                confidence = 0.95
                for i, date in enumerate(date_range):
                    predictions.append({
                        'date': date.strftime('%Y-%m-%d'),
                        'predictedSales': float(forecast.iloc[i]),
                        'confidenceLevel': confidence
                    })
            except ImportError:
                fitted = ARIMA(train['totalAmount'], order=(1, 1, 1)).fit()
                forecast = fitted.forecast(steps=len(date_range))
                confidence = 0.95
                for i, date in enumerate(date_range):
                    predictions.append({
                        'date': date.strftime('%Y-%m-%d'),
                        'predictedSales': float(forecast.iloc[i]),
                        'confidenceLevel': confidence
                    })
        else:
            feature_cols = ['month', 'quarter', 'lag_1', 'lag_2', 'rolling_mean_3', 'rolling_std_3', 'promotion']
            X_train = train[feature_cols].fillna(0)
            y_train = train['totalAmount']
            if (y_train == 0).all():
                raise ValueError("RandomForest training data contains only zeros")
            model = RandomForestRegressor(
                n_estimators=50,
                max_depth=5,
                min_samples_split=2,
                random_state=42
            )
            model.fit(X_train, y_train)
            confidence = max(0, min(1, model.score(X_train, y_train))) * 100

            # Prepare features for future predictions
            current_df = sales_df.copy()
            for date in date_range:
                last_row = current_df.iloc[-1:].copy()
                last_row.index = [date]
                last_row['lag_1'] = current_df['totalAmount'].iloc[-1]
                last_row['lag_2'] = current_df['lag_1'].iloc[-1] if len(current_df) > 1 else 0
                last_row['rolling_mean_3'] = current_df['totalAmount'].rolling(window=3).mean().iloc[-1]
                last_row['rolling_std_3'] = current_df['totalAmount'].rolling(window=3).std().iloc[-1]
                last_row['month'] = date.month
                last_row['quarter'] = date.quarter
                last_row['promotion'] = current_df['promotion'].iloc[-1]
                X_pred = last_row[feature_cols].fillna(0)
                pred = model.predict(X_pred)[0]
                predictions.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'predictedSales': float(pred),
                    'confidenceLevel': confidence
                })
                # Append prediction to current_df for next iteration
                new_row = pd.DataFrame({
                    'totalAmount': [pred],
                    'promotion': [last_row['promotion'].iloc[0]],
                    'month': [date.month],
                    'quarter': [date.quarter],
                    'lag_1': [last_row['totalAmount'].iloc[0]],
                    'lag_2': [last_row['lag_1'].iloc[0]],
                    'rolling_mean_3': [current_df['totalAmount'].rolling(window=3).mean().iloc[-1] if len(current_df) >= 3 else pred],
                    'rolling_std_3': [current_df['totalAmount'].rolling(window=3).std().iloc[-1] if len(current_df) >= 3 else 0],
                }, index=[date])
                current_df = pd.concat([current_df, new_row])

    except Exception as e:
        print(json.dumps({"error": f"Model training error: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    print("Step 6: Calculate metrics")
    try:
        if len(test) > 0 and test['totalAmount'].iloc[0] != 0:
            rmse = np.sqrt(mean_squared_error(test['totalAmount'], [predictions[0]['predictedSales']]))
            mae = mean_absolute_error(test['totalAmount'], [predictions[0]['predictedSales']])
            mape = calculate_mape(test['totalAmount'], [predictions[0]['predictedSales']])
        else:
            rmse = mae = mape = 0
    except Exception as e:
        print(json.dumps({"error": f"Metric calculation error: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    print("Step 7: Return result")
    result = {
        'predictions': predictions,
        'features': {
            'seasonality': features['seasonality'],
            'promotion': features['promotion'],
            'laggedSales': features['laggedSales'],
            'economicTrend': features['economicTrend'],
        },
        'metrics': {
            'rmse': float(rmse),
            'mae': float(mae),
            'mape': float(mape)
        }
    }
    print(json.dumps(result))

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e), "type": type(e).__name__}), file=sys.stderr)
        sys.exit(1)