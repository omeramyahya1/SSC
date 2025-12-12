from api import get_project_data

if __name__ == "__main__":
    project_id = 1  # Example project ID for testing
    project_data_json = get_project_data(project_id)
    if project_data_json:
        print(project_data_json)
    else:
        print("No data returned.")